import { describe, expect, it, vi } from "vitest";
import { createEquipeAgents } from "./runner";
import { createAgentWorkHandler } from "./agent-work";
import { FakeModelClient, textResponse } from "./testing";
import { confirmedHandoff } from "../module/testing/diagnosis";
import { uuid } from "../module/testing/deps";

vi.mock("@/server/storage", () => ({ objectStorage: { publicUrl: (key: string) => `https://canonical.example/${key}` } }));

async function setup() {
  const f = await confirmedHandoff();
  f.t.deps.hasClassicPaidAccess = async () => true;
  const client = new FakeModelClient([textResponse("Imagem recebida.")]);
  const agents = createEquipeAgents({ moduleDeps: f.t.deps, client });
  const worker = createAgentWorkHandler({ depsFor: () => f.t.deps, agentsFor: () => agents });
  return { ...f, client, agents, worker };
}

describe("strategist image provenance at the reusable boundary", () => {
  it.each(["http://127.0.0.1/a", "http://[::1]/a", "http://10.0.0.1/a", "http://169.254.169.254/a", "https://attacker.example/a"])("rejects %s in both runner and worker with zero model calls", async url => {
    const s = await setup();
    const task = { ...s.scope, kind: "strategist_turn", input: { message: "Veja", images: [{ type: "image_url", image_url: { url } }] } };
    expect((await s.agents.runTask(task)).ok).toBe(false);
    await expect(s.worker({ event: { data: task }, step: { run: async (_name, fn) => fn() } })).rejects.toThrow("invalid_agent_input");
    expect(s.client.requests).toHaveLength(0);
  });

  it("rejects unknown, cross-workspace and non-image assets, even when the input claims a trusted URL/key/MIME", async () => {
    const s = await setup();
    const other = uuid(); const document = uuid(); const own = uuid();
    s.t.gateway.addAsset({ id: other, workspaceId: uuid(), kind: "image/png", key: "cross" });
    s.t.gateway.addAsset({ id: document, workspaceId: s.workspaceId, kind: "text/plain", key: "doc" });
    s.t.gateway.addAsset({ id: own, workspaceId: s.workspaceId, kind: "image/png", key: "own" });
    for (const images of [[{ assetId: uuid() }], [{ assetId: other }], [{ assetId: document }], [{ assetId: own, url: "http://127.0.0.1/a", key: "forged", type: "image/png" }]]) {
      const task = { ...s.scope, kind: "strategist_turn", input: { message: "Veja", images } };
      expect((await s.agents.runTask(task)).ok).toBe(false);
      await expect(s.worker({ event: { data: task }, step: { run: async (_name, fn) => fn() } })).rejects.toThrow("invalid_agent_input");
    }
    expect(s.client.requests).toHaveLength(0);
  });

  it("fails closed if the gateway cannot establish provenance or the image count exceeds five", async () => {
    const s = await setup(); const assetId = uuid();
    s.t.gateway.getAssetForBrand = async () => { throw new Error("asset_lookup_failed"); };
    for (const images of [[{ assetId }], Array.from({ length: 6 }, () => ({ assetId }))]) {
      expect((await s.agents.runTask({ ...s.scope, kind: "strategist_turn", input: { message: "Veja", images } })).ok).toBe(false);
    }
    expect(s.client.requests).toHaveLength(0);
  });

  it("rejects another brand's image of the same workspace: the account sees its brand's Library, nothing else", async () => {
    const s = await setup(); const otherBrand = uuid(); const foreign = uuid(); const provisional = uuid();
    s.t.gateway.addAsset({ id: foreign, workspaceId: s.workspaceId, kind: "image/png", key: "brands/other.png", clientProfileId: otherBrand });
    s.t.gateway.addAsset({ id: provisional, workspaceId: s.workspaceId, kind: "image/png", key: "provisional.png", clientProfileId: null, metadata: { provisional: true } });
    for (const assetId of [foreign, provisional]) {
      const task = { ...s.scope, kind: "strategist_turn", input: { message: "Veja", images: [{ assetId }] } };
      expect(await s.agents.runTask(task)).toMatchObject({ ok: false, error: "invalid_agent_input:untrusted_image_asset" });
      await expect(s.worker({ event: { data: task }, step: { run: async (_name, fn) => fn() } })).rejects.toThrow("invalid_agent_input");
    }
    expect(s.client.requests).toHaveLength(0);
  });

  it("accepts the account brand's own image and an unbranded shared one", async () => {
    const s = await setup(); const own = uuid(); const shared = uuid();
    const [account] = await s.t.deps.uow.repos.accounts.list(s.workspaceId);
    s.t.gateway.addAsset({ id: own, workspaceId: s.workspaceId, kind: "image/png", key: "brands/own.png", clientProfileId: account!.clientProfileId });
    s.t.gateway.addAsset({ id: shared, workspaceId: s.workspaceId, kind: "image/png", key: "shared.png", clientProfileId: null });
    expect((await s.agents.runTask({ ...s.scope, kind: "strategist_turn", input: { message: "Veja", images: [{ assetId: own }, { assetId: shared }] } })).ok).toBe(true);
    expect(s.client.requests[0]!.messages.at(-1)).toEqual({ role: "user", content: [
      { type: "text", text: "Veja" },
      { type: "image_url", image_url: { url: "https://canonical.example/brands/own.png" } },
      { type: "image_url", image_url: { url: "https://canonical.example/shared.png" } },
    ] });
  });

  it("resolves a workspace-owned image from the trusted gateway and canonical storage", async () => {
    const s = await setup(); const assetId = uuid();
    s.t.gateway.addAsset({ id: assetId, workspaceId: s.workspaceId, kind: "image/png", key: "stored/own.png" });
    expect((await s.agents.runTask({ ...s.scope, kind: "strategist_turn", input: { message: "", images: [{ assetId }] } })).ok).toBe(true);
    expect(s.client.requests).toHaveLength(1);
    expect(s.client.requests[0]!.messages.at(-1)).toEqual({ role: "user", content: [{ type: "image_url", image_url: { url: "https://canonical.example/stored/own.png" } }] });
    expect(s.client.requests[0]!.tools?.map(tool => tool.name)).toEqual(["sugerir_proximos_passos"]);
  });
});

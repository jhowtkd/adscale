// Ticket 19: when the one raster line has no room left for a workspace (its waiting bytes are at the cap), the POST says "try again" (503 + Retry-After) instead of an unknown 500.
// The route and the upload module are the real ones, with the queue, the child and the header reading real too; only auth, repositories, storage and Inngest are fakes.
// What is counted is the answer of each request (by count and by header), never the time.
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RasterRetryError } from "@/server/equipe/handoff/raster-image";
import * as childTransport from "@/server/equipe/handoff/svg-draw-child";

const stored: string[] = [];
const freePlan = vi.hoisted(() => ({ find: vi.fn<(workspaceId: string) => Promise<{ accountId: string } | null>>(async () => null) }));
// The rule is the fake; refuseOnFreePlan and apiError are the real ones.
vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: () => Promise.resolve({ user: { id: "user-1" }, workspace: { id: "ws-capacity" } }) }));
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: async () => ({ id: "profile-1" }),
  createTrainingReference: async (_workspaceId: string, input: Record<string, unknown>) => ({ id: "ref-1", ...input }),
  deleteTrainingReference: async () => null,
  getTrainingReferences: async () => [],
}));
vi.mock("@/server/repositories/workspace-asset", () => ({ createWorkspaceAsset: async (input: Record<string, unknown>) => ({ id: "asset-1", ...input }), deleteWorkspaceAsset: async () => null, getWorkspaceAssetsByKeys: async () => [] }));
vi.mock("@/server/storage", () => ({ objectStorage: { put: async (key: string) => { stored.push(key); }, delete: async () => undefined, publicUrl: (key: string) => `https://cdn.example/${key}` } }));
vi.mock("@/server/jobs/client", () => ({ inngest: { send: async () => undefined } }));

const upload = vi.hoisted(() => ({ failWith: undefined as unknown }));
vi.mock("@/server/brand-training/upload", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/brand-training/upload")>();
  return { ...actual, normalizeTrainingUpload: (...args: Parameters<typeof actual.normalizeTrainingUpload>) => (upload.failWith ? Promise.reject(upload.failWith) : actual.normalizeTrainingUpload(...args)) };
});
const { POST } = await import("./route");

const post = (bytes: Buffer, name = "ref.png", type = "image/png") => {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return POST(new Request("http://localhost/api/client-profiles/profile-1/training-assets", { method: "POST", body: form }), { params: Promise.resolve({ id: "profile-1" }) });
};
/** A valid PNG padded after its end with 9 MiB of zeros (a decoder ignores what follows IEND): the file is small to read and big to wait for. */
let heavy: Buffer;
let light: Buffer;
beforeAll(async () => {
  light = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#336699" } }).png().toBuffer();
  heavy = Buffer.concat([light, Buffer.alloc(9 * 1024 * 1024)]);
});

describe("training-assets POST: no room in the raster line is a 503 that says when to retry", () => {
  it("eight uploads of 9 MiB from one workspace: the line holds the one running and five waiting (under the 50 MiB of an account); the other two get 503 with Retry-After 1, nothing is a 500, and the line is free after", async () => {
    // Hold the first decoder until both excess requests have reached admission.
    // Multipart parsing and child startup must not turn this count into a timing race on CI.
    const actualRun = childTransport.runImageChild;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let first = true, rejected = 0;
    const transport = vi.spyOn(childTransport, "runImageChild").mockImplementation(async (...args) => {
      if (first) { first = false; await gate; }
      return actualRun(...args);
    });
    let answers: Awaited<ReturnType<typeof post>>[];
    try {
      answers = await Promise.all(Array.from({ length: 8 }, async () => {
        const response = await post(heavy);
        if (response.status === 503 && ++rejected === 2) release();
        return response;
      }));
    } finally { release(); transport.mockRestore(); }
    const statuses = answers.map(r => r.status).sort();
    expect(statuses.filter(s => s === 201)).toHaveLength(6);
    expect(statuses.filter(s => s === 503)).toHaveLength(2);
    expect(statuses.filter(s => s >= 500 && s !== 503)).toEqual([]);
    for (const response of answers.filter(r => r.status === 503)) {
      expect(response.headers.get("Retry-After")).toBe("1");
      expect(await response.json()).toMatchObject({ code: "internalError" });
    }
    for (const response of answers.filter(r => r.status === 201)) expect(response.headers.get("Retry-After")).toBeNull();
    // Only the accepted uploads reached the storage.
    expect(stored).toHaveLength(6);
    // The retry that the header asks for works: with the line empty, the same upload is accepted.
    expect((await post(heavy)).status).toBe(201);
  }, 120_000);
  it("a capacity refusal at the upload module is 503 with the header, whatever the file (the handler maps the error, not the size)", async () => {
    upload.failWith = new RasterRetryError("capacity");
    try {
      const response = await post(light);
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("1");
    } finally { upload.failWith = undefined; }
  });
  it("what is not capacity keeps its answers: an invalid type is 400, an invalid size 400 (and neither carries Retry-After)", async () => {
    const wrongType = await post(light, "x.txt", "text/plain");
    expect(wrongType.status).toBe(400);
    expect(wrongType.headers.get("Retry-After")).toBeNull();
    const tooBig = await post(Buffer.alloc(10 * 1024 * 1024 + 1), "big.png");
    expect(tooBig.status).toBe(400);
  });
});

describe("training-assets POST: the free-plan refusal comes before the raster line (ticket 11, part 2)", () => {
  afterEach(() => { freePlan.find.mockReset(); freePlan.find.mockResolvedValue(null); });
  it("on the free plan a big upload gets 402 free_plan: the raster child is never started, nothing is stored, and the line stays free", async () => {
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });
    const storedBefore = stored.length;
    const transport = vi.spyOn(childTransport, "runImageChild");
    try {
      const response = await post(light);
      expect(response.status).toBe(402);
      const body = await response.json();
      expect(body).toMatchObject({ code: "free_plan", details: { recommendedAction: "plan_request", accountId: "acc-free" } });
      expect(response.headers.get("Retry-After")).toBeNull();
      expect(freePlan.find).toHaveBeenCalledTimes(1);
      expect(freePlan.find).toHaveBeenCalledWith("ws-capacity");
      expect(transport).not.toHaveBeenCalled();
      expect(stored).toHaveLength(storedBefore);
    } finally { transport.mockRestore(); }
    // Off the free plan the same upload goes through the line again.
    freePlan.find.mockResolvedValue(null);
    expect((await post(light)).status).toBe(201);
    expect(freePlan.find).toHaveBeenCalledTimes(2);
  });
});

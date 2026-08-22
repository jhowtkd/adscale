import { describe, expect, it, vi } from "vitest";
const claim = vi.hoisted(() => vi.fn(async () => ({ ok: false, code: "quota_exhausted" })));
vi.mock("@/server/layer-editor/quota", () => ({ claimLayerEditorQuota: claim, releaseLayerEditorQuota: vi.fn() }));
import { requestCreativeWorkLayerRegeneration } from "./request-creative-work-layer-regeneration";
describe("requestCreativeWorkLayerRegeneration", () => it("does not dispatch when quota is exhausted", async () => expect(await requestCreativeWorkLayerRegeneration({workspaceId:"w",workItemId:"i",outputId:"o",userId:"u",leaseId:"00000000-0000-4000-8000-000000000001",expectedRevision:1,operationId:"00000000-0000-4000-8000-000000000002",layerId:"00000000-0000-4000-8000-000000000003",instruction:"x"})).toMatchObject({ok:false,code:"quota_exhausted"})));

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/auth/require-platform-owner", () => ({ requirePlatformOwner: vi.fn() }));
vi.mock("@/server/human-quality/learning/proposals", async importOriginal => ({ ...await importOriginal<object>(), acceptClientLearningProposal: vi.fn() }));
vi.mock("@/server/human-quality/learning/proposal-approval", async importOriginal => ({ ...await importOriginal<object>(), editLearningProposal: vi.fn(), approveLearningProposal: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
import { POST, PATCH } from "./route";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { acceptClientLearningProposal } from "@/server/human-quality/learning/proposals";
import { editLearningProposal, approveLearningProposal, GuidanceProposalError } from "@/server/human-quality/learning/proposal-approval";
import { WorkspaceAuthError, AUTH_ERROR_CODES } from "@/server/auth/errors";
const id = "550e8400-e29b-41d4-a716-446655440001";
const expectedRevision = "a".repeat(64);
const metadata = { category: "voice", nature: "text", roles: ["copy"], generationModes: ["single"], formats: ["1:1"] };
const context = { params: Promise.resolve({ id }) };
const request = (method: string, data?: unknown) => new Request(`http://localhost/api/admin/quality/learning/proposals/${id}/accept`, { method, ...(data === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(data) }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformOwner).mockResolvedValue({ user: { id: "owner", email: "owner@example.com" } });
  vi.mocked(acceptClientLearningProposal).mockResolvedValue({ proposal: { id, status: "accepted" }, rule: { id: "rule" } } as never);
  vi.mocked(approveLearningProposal).mockResolvedValue({ proposal: { id, status: "approved" }, rule: { id } } as never);
  vi.mocked(editLearningProposal).mockResolvedValue({ id, expectedRevision: "b".repeat(64) } as never);
});
describe("proposal edit and approval HTTP contract", () => {
  it.each([undefined, {}, { expectedRevision: "old" }])("requires the revision read before approving (%j)", async data => {
    expect((await POST(request("POST", data), context)).status).toBe(400);
    expect(acceptClientLearningProposal).not.toHaveBeenCalled();
    expect(approveLearningProposal).not.toHaveBeenCalled();
  });
  it("passes revision and fixture acknowledgement with the authenticated author", async () => {
    expect((await POST(request("POST", { expectedRevision, acknowledgeFixtureOnly: true }), context)).status).toBe(200);
    expect(acceptClientLearningProposal).toHaveBeenCalledWith({ proposalId: id, reviewerUserId: "owner", expectedRevision, acknowledgeFixtureOnly: true });
  });
  it("routes rule approval through the same reviewed command", async () => {
    expect((await POST(request("POST", { kind: "rule", expectedRevision, acknowledgeCaveats: true }), context)).status).toBe(200);
    expect(approveLearningProposal).toHaveBeenCalledWith({ kind: "rule", proposalId: id, reviewerUserId: "owner", expectedRevision, acknowledgeCaveats: true });
  });
  it.each(["corpus_quality", "rule"])("PATCH preserves exact bytes for %s and binds editor to session", async kind => {
    const text = "  Convite direto 😀  ";
    const result = await PATCH(request("PATCH", { kind, expectedRevision, text, metadata }), context);
    expect(result.status).toBe(200);
    expect(editLearningProposal).toHaveBeenCalledWith({ kind, expectedRevision, text, metadata, proposalId: id, reviewerUserId: "owner" });
    expect((await result.json()).proposal.expectedRevision).toBe("b".repeat(64));
  });
  it.each([POST, PATCH])("refuses actor spoofing on %s", async handler => {
    expect((await handler(request(handler === POST ? "POST" : "PATCH", { expectedRevision, text: "t", metadata, reviewerUserId: "other" }), context)).status).toBe(400);
    expect(editLearningProposal).not.toHaveBeenCalled(); expect(acceptClientLearningProposal).not.toHaveBeenCalled();
  });
  it.each([POST, PATCH])("returns conflict with the updated state on %s", async handler => {
    const current = { id, rationale: "Outro texto", expectedRevision: "b".repeat(64) };
    const error = new GuidanceProposalError("revision_conflict", "A proposta mudou.", current);
    vi.mocked(acceptClientLearningProposal).mockRejectedValue(error); vi.mocked(editLearningProposal).mockRejectedValue(error);
    const result = await handler(request(handler === POST ? "POST" : "PATCH", handler === POST ? { expectedRevision } : { expectedRevision, text: "t", metadata }), context);
    expect(result.status).toBe(409); expect(await result.json()).toEqual({ error: "revision_conflict", message: "A proposta mudou.", current });
  });
  it.each(["budget_exceeded", "invalid_guidance", "metadata_required", "fixture_ack_required"] as const)("returns domain error %s without success", async code => {
    vi.mocked(acceptClientLearningProposal).mockRejectedValue(new GuidanceProposalError(code, "Confira a orientação."));
    const result = await POST(request("POST", { expectedRevision }), context);
    expect(result.status).toBe(422); expect(await result.json()).toMatchObject({ error: code });
  });
  it.each(["workspace_owner", "workspace_admin", "operator", "agent"])("denies %s before either command", async () => {
    vi.mocked(requirePlatformOwner).mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden"));
    expect((await PATCH(request("PATCH", { expectedRevision, text: "t", metadata }), context)).status).toBe(403);
    expect((await POST(request("POST", { expectedRevision }), context)).status).toBe(403);
    expect(editLearningProposal).not.toHaveBeenCalled(); expect(acceptClientLearningProposal).not.toHaveBeenCalled(); expect(approveLearningProposal).not.toHaveBeenCalled();
  });
  it("requires a session", async () => {
    vi.mocked(requirePlatformOwner).mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized"));
    expect((await POST(request("POST", { expectedRevision }), context)).status).toBe(401);
  });
});

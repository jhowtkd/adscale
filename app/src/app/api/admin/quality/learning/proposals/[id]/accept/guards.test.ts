import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientLearningProposal } from "@/server/db/schema";
import type { EvaluatedCorpusRow } from "@/server/human-quality/calibration/types";
import { POST } from "./route";

vi.mock("@/server/auth/require-platform-owner", () => ({ requirePlatformOwner: vi.fn().mockResolvedValue({ user: { id: "owner-1" } }) }));
vi.mock("@/server/repositories/human-quality-corpus", () => ({ listEvaluatedCorpusWithEvaluations: vi.fn() }));
vi.mock("@/server/repositories/assistant-goal", () => ({ getCorpusConsent: vi.fn() }));
vi.mock("@/server/repositories/client-reference", () => ({ getClientProfile: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn().mockResolvedValue((key: string) => key) }));

const writes = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/server/db", () => ({ db: { transaction: vi.fn(async callback => callback(tx)) } }));
vi.mock("@/server/auth/platform-owner", () => ({ isPlatformOwnerEmail: vi.fn(() => true) }));
import { learningProposalRevision } from "@/server/brand-taste/proposal-review";
import { hashGuidanceContent } from "@/server/brand-taste/learned-guidance";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { getCorpusConsent } from "@/server/repositories/assistant-goal";
import { getClientProfile } from "@/server/repositories/client-reference";

const workspaceId = "550e8400-e29b-41d4-a716-446655440001";
const clientProfileId = "550e8400-e29b-41d4-a716-446655440002";
const id = "550e8400-e29b-41d4-a716-446655440003";
let proposal: ClientLearningProposal;
let rows: EvaluatedCorpusRow[];
let reads: object[][];
const tx = {
  select: () => { const values = reads.shift() ?? []; const query = { from: () => query, where: () => query, for: () => query, limit: async () => values, then: (resolve: (value: unknown) => unknown) => Promise.resolve(values).then(resolve) }; return query; },
  update: () => { let patch: Record<string, unknown>; const query = { set: (value: Record<string, unknown>) => { patch = value; writes.push(value); return query; }, where: () => query, returning: async () => [{ ...proposal, ...patch }] }; return query; },
  insert: () => ({ values: (value: Record<string, unknown>) => { writes.push(value); return { returning: async () => [{ ...value, id: "rule-1" }] }; } }),
};

function accept(body: unknown = { acknowledgeFixtureOnly: true }) {
  reads = [[{ id: "owner-1", name: "Dono", email: "owner@example.com" }], [proposal], ...(proposal.status === "rejected" ? [[]] : []), [{ id: clientProfileId }], [{ status: "granted" }], []];
  return POST(new Request(`http://localhost/api/admin/quality/learning/proposals/${id}/accept`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: learningProposalRevision("corpus_quality", proposal), ...body as object }),
  }), { params: Promise.resolve({ id }) });
}

describe("Synthetic acknowledgment through HTTP and the real proposal service", () => {
  beforeEach(() => {
    vi.clearAllMocks(); writes.length = 0;
    rows = ["a", "b", "c"].map(itemId => ({
      item: { id: itemId, derivationId: `deriv-${itemId}`, workspaceId, clientProfileId, generationMode: "art_variation", format: "1:1",
        qualitySnapshot: { qualityScore: 80, qualityVerdict: "pass" } },
      evaluation: { id: `evaluation-${itemId}`, workspaceId, corpusItemId: itemId, visualScore: 62,
        factualPass: true, intent: "reject", primaryFailureReason: "visual_overload", createdAt: new Date("2026-10-01") },
      sourceLabel: "synthetic_fixture",
    } as EvaluatedCorpusRow));
    proposal = { id, workspaceId, clientProfileId, status: "proposed",
      sliceKey: `${workspaceId}:${clientProfileId}:visual_overload|art_variation|1:1`,
      primaryFailureReason: "visual_overload", rationale: "Use um foco dominante.",
      proposalDraft: { originalText: "Use um foco dominante.", editedText: "Texto conferido", revision: 1, editedBy: "owner-1", editedByName: "Dono", editedAt: new Date().toISOString(), metadata: { category: "voice", nature: "text", roles: ["copy"], generationModes: ["single"], formats: ["1:1"], contentHash: hashGuidanceContent("Texto conferido") } },
      evidenceRefs: { corpusItemIds: ["a", "b", "c"], fixtureOnly: true,
        stats: { count: 3, meanSignedDelta: 18, meanAbsError: 18, overScoreCount: 3, underScoreCount: 0 } },
    } as ClientLearningProposal;
    vi.mocked(listEvaluatedCorpusWithEvaluations).mockImplementation(async () => rows);
    vi.mocked(getCorpusConsent).mockResolvedValue({ status: "granted" } as never);
    vi.mocked(getClientProfile).mockResolvedValue({ id: clientProfileId, workspaceId } as never);
  });

  it.each([
    ["rejected", 404, "not_proposed"], ["scope", 403, "brand_out_of_scope"],
    ["consent", 403, "client_consent_required"], ["objective", 422, "insufficient_evidence"],
    ["export", 422, "insufficient_evidence"], ["evidence-scope", 422, "insufficient_evidence"],
  ] as const)("confirmation does not bypass %s", async (invalid, status, code) => {
    if (invalid === "rejected") proposal.status = "rejected";
    if (invalid === "scope") vi.mocked(getClientProfile).mockResolvedValue(null);
    if (invalid === "consent") vi.mocked(getCorpusConsent).mockResolvedValue(null);
    if (invalid === "objective") rows[0].evaluation.factualPass = false;
    if (invalid === "export") rows[0].item.qualitySnapshot.exportStatus = { value: "bloqueado" };
    if (invalid === "evidence-scope") rows[0].item.clientProfileId = "another-brand";
    const response = await accept();
    expect(response.status).toBe(status);
    const data = await response.json();
    expect(data.code ?? data.error).toBe(code);
    expect(writes).toEqual([]);
  });

  it("requires a boolean explicit confirmation and records the synthetic caveat on valid acceptance", async () => {
    expect((await accept({})).status).toBe(422);
    expect((await accept({ acknowledgeFixtureOnly: "true" })).status).toBe(400);
    expect(writes).toEqual([]);
    expect((await accept()).status).toBe(200);
    expect(writes).toContainEqual(expect.objectContaining({ approvedBy: "owner-1", caveats: ["fixture_only_corpus"] }));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/derivation", () => ({
  getDerivationById: vi.fn(),
}));

vi.mock("@/server/repositories/client-reference", () => ({
  createClientReference: vi.fn(),
  getClientProfile: vi.fn(),
}));

vi.mock("@/server/memory/brand-memory-dispatch", () => ({
  recordBrandMemoryEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/server/output-learning/output-decision-recorder", () => ({
  recordOutputDecisionEvidenceBestEffort: vi.fn(() =>
    Promise.resolve({ id: "evidence-1" })
  ),
}));

import { getDerivationById } from "@/server/repositories/derivation";
import {
  createClientReference,
  getClientProfile,
} from "@/server/repositories/client-reference";
import { recordBrandMemoryEvent } from "@/server/memory/brand-memory-dispatch";
import { recordOutputDecisionEvidenceBestEffort } from "@/server/output-learning/output-decision-recorder";
import { saveDerivationReference } from "./save-derivation-reference";

const mockGetDerivation = vi.mocked(getDerivationById);
const mockCreateRef = vi.mocked(createClientReference);
const mockGetProfile = vi.mocked(getClientProfile);
const mockMemory = vi.mocked(recordBrandMemoryEvent);
const mockEvidence = vi.mocked(recordOutputDecisionEvidenceBestEffort);

const approved = {
  id: "d1",
  status: "approved",
  outputKey: "derivations/d1/out.png",
  workspaceId: "ws-1",
  campaignId: "c1",
  format: "1:1",
  generationMode: "art_variation",
  ctaText: "Buy",
  qualityScore: 80,
  qaStatus: "passed",
  qualityVerdict: "acceptable",
  hardFailures: [],
};

describe("saveDerivationReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockResolvedValue({
      id: "p1",
      name: "Acme",
    } as Awaited<ReturnType<typeof getClientProfile>>);
    mockCreateRef.mockResolvedValue({
      id: "ref-1",
      label: "Winner",
      kind: "style",
      notes: null,
      assetKey: "derivations/d1/out.png",
      clientProfileId: "p1",
      sourceDerivationId: "d1",
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
    } as Awaited<ReturnType<typeof createClientReference>>);
  });

  it("rejects non-approved derivation", async () => {
    mockGetDerivation.mockResolvedValue({
      ...approved,
      status: "completed",
    } as never);
    const result = await saveDerivationReference({
      workspaceId: "ws-1",
      derivationId: "d1",
      clientProfileId: "p1",
      label: "Winner",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("derivation_not_approved");
    expect(mockCreateRef).not.toHaveBeenCalled();
  });

  it("creates reference and records brand memory for both surfaces", async () => {
    mockGetDerivation.mockResolvedValue(approved as never);

    const http = await saveDerivationReference({
      workspaceId: "ws-1",
      derivationId: "d1",
      clientProfileId: "p1",
      label: "Winner",
      kind: "style",
      actorUserId: "u1",
      evidenceSource: "derivations.save-reference.POST",
    });
    const assistant = await saveDerivationReference({
      workspaceId: "ws-1",
      derivationId: "d1",
      clientProfileId: "p1",
      label: "Winner",
      kind: "style",
    });

    expect(http.ok).toBe(true);
    expect(assistant.ok).toBe(true);
    expect(mockCreateRef).toHaveBeenCalledTimes(2);
    expect(mockMemory).toHaveBeenCalledTimes(2);
    expect(mockEvidence).toHaveBeenCalledTimes(1);
    expect(mockEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "saved_reference",
        derivationId: "d1",
        source: "derivations.save-reference.POST",
      })
    );
  });
});

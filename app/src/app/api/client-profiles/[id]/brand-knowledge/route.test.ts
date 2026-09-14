import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RepertoireSelectionRequiredError,
  RepertoireSynthesisError,
} from "@/server/brand-training/synthesize-repertoire";
import { GET, PATCH } from "./route";

const claims = [
  { id: "claim-1", claimKey: "palette.colors", value: ["#D71F2B"], scope: { level: "global" }, authority: "inferred", confidence: "medium", status: "candidate", evidenceRefs: [] },
];
const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(),
  listClaims: vi.fn(),
  listVersions: vi.fn(),
  reviewClaim: vi.fn(),
  reviewRepertoire: vi.fn(),
  synthesizeRepertoire: vi.fn(),
  getClientProfile: vi.fn(),
  CalibrationError: null as unknown as new (
    code: "calibration_required" | "calibration_stale",
    message?: string,
  ) => Error,
  ConflictError: null as unknown as new (message?: string) => Error,
  EvidenceError: null as unknown as new (message?: string) => Error,
  RepertoireError: null as unknown as new (
    code: "no_sources" | "unknown_reference" | "unverifiable_source",
    message?: string,
  ) => Error,
}));

vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: (...args: unknown[]) => mocks.requireWorkspaceAccess(...args) }));
vi.mock("@/server/repositories/brand-knowledge", () => {
  // Stub error classes: the route and this test share the mocked module
  // instance, so instanceof checks behave like the real classes without
  // loading the database-backed module.
  class BrandKnowledgeCalibrationError extends Error {
    readonly code: "calibration_required" | "calibration_stale";
    constructor(code: "calibration_required" | "calibration_stale", message?: string) {
      super(message ?? code);
      this.name = "BrandKnowledgeCalibrationError";
      this.code = code;
    }
  }
  class BrandKnowledgeConflictError extends Error {
    constructor(message?: string) {
      super(message ?? "conflict");
      this.name = "BrandKnowledgeConflictError";
    }
  }
  class BrandKnowledgeEvidenceError extends Error {}
  mocks.CalibrationError = BrandKnowledgeCalibrationError;
  mocks.ConflictError = BrandKnowledgeConflictError;
  mocks.EvidenceError = BrandKnowledgeEvidenceError;
  return {
    BrandKnowledgeCalibrationError,
    BrandKnowledgeConflictError,
    BrandKnowledgeEvidenceError,
    listBrandKnowledgeClaims: (...args: unknown[]) => mocks.listClaims(...args),
    listBrandKnowledgeVersions: (...args: unknown[]) => mocks.listVersions(...args),
    reviewBrandKnowledgeClaim: (...args: unknown[]) => mocks.reviewClaim(...args),
    reviewRepertoireCollection: (...args: unknown[]) => mocks.reviewRepertoire(...args),
  };
});
vi.mock("@/server/application/synthesize-brand-repertoire", () => {
  class BrandRepertoireError extends Error {
    readonly code: "no_sources" | "unknown_reference" | "unverifiable_source";
    constructor(code: "no_sources" | "unknown_reference" | "unverifiable_source", message?: string) {
      super(message ?? code);
      this.name = "BrandRepertoireError";
      this.code = code;
    }
  }
  mocks.RepertoireError = BrandRepertoireError;
  return {
    BrandRepertoireError,
    synthesizeBrandRepertoire: (...args: unknown[]) => mocks.synthesizeRepertoire(...args),
  };
});
vi.mock("@/server/repositories/client-reference", () => ({
  getClientProfile: (...args: unknown[]) => mocks.getClientProfile(...args),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

describe("/api/client-profiles/[id]/brand-knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "workspace-1" } });
    mocks.listClaims.mockResolvedValue(claims);
    mocks.listVersions.mockResolvedValue([{ id: "version-1", status: "active", hash: "a".repeat(64) }]);
    mocks.reviewClaim.mockResolvedValue({ ...claims[0], status: "approved", reviewedByUserId: "user-1" });
    mocks.getClientProfile.mockResolvedValue({ id: "profile-1" });
  });

  it("lists reviewable claims and immutable version history without mutating state", async () => {
    const response = await GET(new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge"), { params: Promise.resolve({ id: "profile-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.listClaims).toHaveBeenCalledWith("workspace-1", "profile-1");
    expect(mocks.reviewClaim).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ claims, activeVersion: { id: "version-1" } });
  });

  it("records an explicit human decision with alternatives", async () => {
    const response = await PATCH(new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        claimId: "claim-1",
        status: "approved",
        value: ["#D71F2B"],
        alternatives: [{ claimId: "claim-2", value: ["#00FF00"] }],
      }),
    }), { params: Promise.resolve({ id: "profile-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.reviewClaim).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      clientProfileId: "profile-1",
      userId: "user-1",
      status: "approved",
      alternatives: [{ claimId: "claim-2", value: ["#00FF00"] }],
    }));
  });

  const repertoireValue = {
    version: 1,
    common: [{
      id: "11111111-1111-4111-8111-111111111111",
      dimension: "hierarchy",
      observation: "Título domina a leitura",
      application: "Dar ao título escala superior ao texto de apoio",
      avoid: "Competição de dois focos",
      evidenceIds: ["ref-1"],
      confidence: "high",
    }],
    languages: [],
  };

  const patch = (body: unknown) => PATCH(new Request("http://localhost/api/client-profiles/profile-1/brand-knowledge", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "profile-1" }) });

  it("reviews the repertoire as one set with session CAS", async () => {
    mocks.reviewRepertoire.mockResolvedValue({ claim: { id: "claim-9" }, revision: 6 });
    const response = await patch({
      command: "review_repertoire",
      sessionId: "22222222-2222-4222-8222-222222222222",
      expectedRevision: 5,
      value: repertoireValue,
    });
    expect(response.status).toBe(200);
    expect(mocks.reviewRepertoire).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      clientProfileId: "profile-1",
      sessionId: "22222222-2222-4222-8222-222222222222",
      expectedRevision: 5,
      value: repertoireValue,
      userId: "user-1",
    });
    expect(mocks.reviewClaim).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ claim: { id: "claim-9" }, revision: 6 });
  });

  it("maps repertoire review conflicts and stale sessions to 409", async () => {
    mocks.reviewRepertoire.mockRejectedValueOnce(new mocks.ConflictError("conflict"));
    const conflicted = await patch({
      command: "review_repertoire",
      sessionId: "22222222-2222-4222-8222-222222222222",
      expectedRevision: 5,
      value: repertoireValue,
    });
    expect(conflicted.status).toBe(409);
    expect(await conflicted.json()).toMatchObject({ code: "brandKnowledgeConflict" });

    mocks.reviewRepertoire.mockRejectedValueOnce(new mocks.CalibrationError("calibration_stale"));
    const stale = await patch({
      command: "review_repertoire",
      sessionId: "22222222-2222-4222-8222-222222222222",
      expectedRevision: 5,
      value: repertoireValue,
    });
    expect(stale.status).toBe(409);

    const invalid = await patch({
      command: "review_repertoire",
      sessionId: "22222222-2222-4222-8222-222222222222",
      expectedRevision: 5,
      value: { version: 1, common: [], languages: [{ id: "not-a-uuid" }] },
    });
    expect(invalid.status).toBe(400);
  });

  it("synthesizes the repertoire on review request", async () => {
    mocks.synthesizeRepertoire.mockResolvedValue({ claim: { id: "claim-7" }, repertoire: repertoireValue });
    const response = await patch({
      command: "synthesize_repertoire",
      feedback: [{ outputId: "out-1", rating: "bad", note: "título pequeno" }],
    });
    expect(response.status).toBe(201);
    expect(mocks.synthesizeRepertoire).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      profileId: "profile-1",
      feedback: [{ outputId: "out-1", rating: "bad", note: "título pequeno" }],
    });
    expect(await response.json()).toMatchObject({ claim: { id: "claim-7" } });
  });

  it("maps synthesis failures without leaking internals", async () => {
    mocks.synthesizeRepertoire.mockRejectedValueOnce(new mocks.RepertoireError("no_sources"));
    const empty = await patch({ command: "synthesize_repertoire" });
    expect(empty.status).toBe(422);
    expect(await empty.json()).toMatchObject({ code: "no_sources" });

    mocks.synthesizeRepertoire.mockRejectedValueOnce(new RepertoireSelectionRequiredError(49));
    const oversized = await patch({ command: "synthesize_repertoire" });
    expect(oversized.status).toBe(409);
    expect(await oversized.json()).toMatchObject({ code: "brandRepertoireSelectionRequired" });

    mocks.synthesizeRepertoire.mockRejectedValueOnce(
      new RepertoireSynthesisError("invalid_repertoire_proposal", { recoverable: true }),
    );
    const failed = await patch({ command: "synthesize_repertoire" });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ code: "brandRepertoireSynthesisFailed" });
  });
});

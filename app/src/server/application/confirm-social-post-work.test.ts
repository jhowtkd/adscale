import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/creative-work", () => ({
  getCreativeWork: vi.fn(),
  setCreativeWorkCopy: vi.fn(),
  confirmCreativeWorkIdentity: vi.fn(),
}));

vi.mock("@/server/creative-work/identity", () => ({
  createIdentitySnapshot: vi.fn(),
  IdentitySnapshotMissingReferenceError: class IdentitySnapshotMissingReferenceError extends Error {
    missingId: string;
    constructor(missingId: string) {
      super(missingId);
      this.missingId = missingId;
      this.name = "IdentitySnapshotMissingReferenceError";
    }
  },
  IdentitySnapshotMissingAlphaError: class IdentitySnapshotMissingAlphaError extends Error {
    referenceId: string;
    category: string;
    constructor(referenceId: string, category: string) {
      super(referenceId);
      this.referenceId = referenceId;
      this.category = category;
      this.name = "IdentitySnapshotMissingAlphaError";
    }
  },
}));

import {
  createIdentitySnapshot,
  IdentitySnapshotMissingReferenceError,
} from "@/server/creative-work/identity";
import {
  confirmCreativeWorkIdentity,
  getCreativeWork,
  setCreativeWorkCopy,
} from "@/server/repositories/creative-work";
import { confirmSocialPostWork } from "./confirm-social-post-work";

const mockGet = vi.mocked(getCreativeWork);
const mockSetCopy = vi.mocked(setCreativeWorkCopy);
const mockConfirm = vi.mocked(confirmCreativeWorkIdentity);
const mockSnapshot = vi.mocked(createIdentitySnapshot);

const profileId = "00000000-0000-4000-8000-000000000001";
const refId = "00000000-0000-4000-8000-000000000010";
const copy = {
  headline: "Headline",
  body: "Body content",
  cta: "CTA",
};
const brief = {
  theme: "Tema",
  objective: "Objetivo",
  audience: "Publico",
  offer: "Oferta",
};

const workItem = {
  id: "work-1",
  workspaceId: "ws-1",
  clientProfileId: profileId,
  createdByUserId: "u-1",
  toolKind: "social_post",
  status: "draft",
  brief,
  format: "4:5" as const,
  copy: null as typeof copy | null,
  identitySnapshot: null as unknown,
  createdAt: new Date("2026-07-13T12:00:00.000Z"),
  updatedAt: new Date("2026-07-13T12:00:00.000Z"),
};

const identitySnapshot = {
  clientProfileId: profileId,
  confirmedAt: "2026-07-07T00:00:00.000Z",
  assets: [],
  brandKit: {
    colors: [],
    fonts: [],
    toneOfVoice: null,
    prohibitedElements: null,
    requiredElements: null,
  },
};

describe("confirmSocialPostWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ work: workItem, outputs: [] } as never);
    mockSetCopy.mockResolvedValue({ ...workItem, copy } as never);
    mockSnapshot.mockResolvedValue(identitySnapshot as never);
    mockConfirm.mockResolvedValue({
      ...workItem,
      copy,
      identitySnapshot,
      status: "ready",
    } as never);
  });

  it("returns work_not_found without side effects", async () => {
    mockGet.mockResolvedValue(null);
    const result = await confirmSocialPostWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      copy,
      selectedReferenceIds: [refId],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("work_not_found");
    expect(mockSetCopy).not.toHaveBeenCalled();
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it("returns work_not_prepared without side effects when brief is absent", async () => {
    mockGet.mockResolvedValue({ work: { ...workItem, brief: null }, outputs: [], sources: [] } as never);
    const result = await confirmSocialPostWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      copy,
      selectedReferenceIds: [refId],
    });
    expect(result).toEqual({ ok: false, error: { code: "work_not_prepared" } });
    expect(mockSetCopy).not.toHaveBeenCalled();
    expect(mockSnapshot).not.toHaveBeenCalled();
  });

  it("maps legacy copy → briefing → persist, locks identity, returns canonical", async () => {
    const result = await confirmSocialPostWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      copy,
      selectedReferenceIds: [refId],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(mockSetCopy).toHaveBeenCalledWith("ws-1", "work-1", copy);
    // brief + format ride along only to steer the ranked fallback (#178);
    // the explicit selectedReferenceIds still decides this call.
    expect(mockSnapshot).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      clientProfileId: profileId,
      selectedReferenceIds: [refId],
      brief: workItem.brief,
      format: workItem.format,
    });
    expect(mockConfirm).toHaveBeenCalledWith(
      "ws-1",
      "work-1",
      identitySnapshot
    );
    expect(result.value.work.status).toBe("ready");
    expect(result.value.canonical.id).toBe("creative_work:work-1");
    expect(result.value.canonical.briefing.headline).toBe(copy.headline);
    expect(result.value.canonical.intent.kind).toBe("social_post");
  });

  it("accepts canonical briefing write instead of copy", async () => {
    const result = await confirmSocialPostWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      briefing: {
        headline: copy.headline,
        body: copy.body,
        cta: copy.cta,
      },
      selectedReferenceIds: [],
    });

    expect(result.ok).toBe(true);
    expect(mockSetCopy).toHaveBeenCalledWith("ws-1", "work-1", copy);
  });

  it("maps identity reference errors", async () => {
    mockSnapshot.mockRejectedValue(
      new IdentitySnapshotMissingReferenceError(refId)
    );

    const result = await confirmSocialPostWork({
      workspaceId: "ws-1",
      workItemId: "work-1",
      copy,
      selectedReferenceIds: [refId],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("identity_reference_not_approved");
      if (result.error.code === "identity_reference_not_approved") {
        expect(result.error.referenceId).toBe(refId);
      }
    }
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});

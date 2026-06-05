import { describe, it, expect } from "vitest";
import {
  buildApprovalPackageSnapshot,
  buildCreativeNote,
  detectPackageStaleness,
  expandPackageDerivationIds,
  getApprovedRootDerivations,
} from "./client-approval-package";

const baseDerivations = [
  {
    id: "root-1",
    parentId: null,
    status: "approved",
    outputKey: "out/root-1.png",
    format: "1:1",
    generationMode: "art_variation",
    variantIndex: 0,
    ctaText: "Shop now",
    isPreview: false,
  },
  {
    id: "child-4x5",
    parentId: "root-1",
    status: "approved",
    outputKey: "out/child-4x5.png",
    format: "4:5",
    generationMode: "format_adaptation",
    variantIndex: 0,
    ctaText: "Shop now",
    isPreview: false,
  },
  {
    id: "root-2",
    parentId: null,
    status: "approved",
    outputKey: "out/root-2.png",
    format: "9:16",
    generationMode: "art_variation",
    variantIndex: 1,
    ctaText: "Learn more",
    isPreview: false,
  },
  {
    id: "pending-root",
    parentId: null,
    status: "queued",
    outputKey: null,
    format: "1:1",
    isPreview: false,
  },
];

describe("client-approval-package", () => {
  it("lists approved root derivations only", () => {
    const roots = getApprovedRootDerivations(baseDerivations);
    expect(roots.map((d) => d.id)).toEqual(["root-1", "root-2"]);
  });

  it("expands selected roots to include approved children", () => {
    const expanded = expandPackageDerivationIds(["root-1"], baseDerivations);
    expect(expanded).toEqual(["root-1", "child-4x5"]);
  });

  it("builds creative notes from derivation and campaign context", () => {
    const note = buildCreativeNote(baseDerivations[0]!, {
      product: "Sneakers",
      offer: "20% off",
    });
    expect(note).toContain("CTA: Shop now");
    expect(note).toContain("Format: 1:1");
    expect(note).toContain("Offer: 20% off");
  });

  it("detects stale package when a derivation is no longer approved", () => {
    const derivations = [
      ...baseDerivations,
      {
        id: "removed",
        parentId: null,
        status: "rejected",
        outputKey: "out/removed.png",
        isPreview: false,
      },
    ];

    const { isStale, staleReasons } = detectPackageStaleness({
      packageDerivationIds: ["root-1", "child-4x5", "removed"],
      selectedRootIds: ["root-1"],
      derivations,
    });

    expect(isStale).toBe(true);
    expect(staleReasons).toContain("unapproved:removed");
    expect(staleReasons).toContain("extra:removed");
  });

  it("builds package snapshot with items and notes", () => {
    const snapshot = buildApprovalPackageSnapshot({
      selectedRootIds: ["root-1", "root-2"],
      derivations: baseDerivations,
      campaign: { notes: "Client review batch A" },
    });

    expect(snapshot.derivationIds).toEqual([
      "root-1",
      "child-4x5",
      "root-2",
    ]);
    expect(snapshot.items).toHaveLength(3);
    expect(snapshot.notes).toBe("Client review batch A");
    expect(snapshot.isStale).toBe(false);
  });
});

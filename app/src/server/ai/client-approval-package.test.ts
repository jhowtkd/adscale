import { describe, it, expect } from "vitest";
import {
  buildApprovalPackageSnapshot,
  buildCreativeNote,
  detectPackageStaleness,
  expandPackageDerivationIds,
  getApprovedRootDerivations,
  getPackageEligibleRoots,
  inferSelectedRootIdsFromPackage,
  isDerivationApprovalOverride,
  isDerivationPackageBlockedByVerdict,
  isDerivationPackageEligibleByVerdict,
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

  it("omits rejected roots but keeps approved regeneration children", () => {
    const derivations = [
      {
        id: "root-rejected",
        parentId: null,
        status: "rejected",
        outputKey: "out/root-rejected.png",
        format: "1:1",
        isPreview: false,
      },
      {
        id: "regen-child",
        parentId: "root-rejected",
        status: "approved",
        outputKey: "out/regen-child.png",
        format: "1:1",
        isPreview: false,
      },
    ];

    expect(getPackageEligibleRoots(derivations).map((d) => d.id)).toEqual([
      "root-rejected",
    ]);
    expect(expandPackageDerivationIds(["root-rejected"], derivations)).toEqual([
      "regen-child",
    ]);

    const snapshot = buildApprovalPackageSnapshot({
      selectedRootIds: ["root-rejected"],
      derivations,
      campaign: { notes: "Refreshed after rejection" },
    });

    expect(snapshot.derivationIds).toEqual(["regen-child"]);
    expect(snapshot.isStale).toBe(false);
  });

  it("infers selected roots from stored child-only package IDs", () => {
    const derivations = [
      {
        id: "root-rejected",
        parentId: null,
        status: "rejected",
        outputKey: "out/root-rejected.png",
        format: "1:1",
        isPreview: false,
      },
      {
        id: "regen-child",
        parentId: "root-rejected",
        status: "approved",
        outputKey: "out/regen-child.png",
        format: "1:1",
        isPreview: false,
      },
    ];

    expect(
      inferSelectedRootIdsFromPackage(["regen-child"], derivations)
    ).toEqual(["root-rejected"]);

    const snapshot = buildApprovalPackageSnapshot({
      selectedRootIds: ["root-rejected"],
      derivations,
      campaign: { notes: "Refreshed after rejection" },
      packageDerivationIds: ["regen-child"],
    });

    expect(snapshot.isStale).toBe(false);
    expect(snapshot.staleReasons).toEqual([]);
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
    expect(snapshot.items.every((item) => item.approvalOverride === false)).toBe(
      true
    );
    expect(snapshot.notes).toBe("Client review batch A");
    expect(snapshot.isStale).toBe(false);
  });

  it("excludes blocked verdict derivations from package eligibility", () => {
    const derivations = [
      {
        id: "blocked-root",
        parentId: null,
        status: "completed",
        outputKey: "out/blocked.png",
        format: "1:1",
        olharVerdict: { value: "sem_opiniao" },
        isPreview: false,
      },
      {
        id: "eligible-root",
        parentId: null,
        status: "approved",
        outputKey: "out/eligible.png",
        format: "1:1",
        olharVerdict: { value: "pronta" },
        exportStatus: { value: "ok" },
        isPreview: false,
      },
    ];

    expect(isDerivationPackageBlockedByVerdict(derivations[0]!)).toBe(true);
    expect(isDerivationPackageEligibleByVerdict(derivations[0]!)).toBe(false);
    expect(getPackageEligibleRoots(derivations).map((d) => d.id)).toEqual([
      "eligible-root",
    ]);
    expect(expandPackageDerivationIds(["blocked-root"], derivations)).toEqual([]);
    expect(expandPackageDerivationIds(["eligible-root"], derivations)).toEqual([
      "eligible-root",
    ]);
  });

  it("includes override-approved blocked derivations with explicit marker", () => {
    const derivations = [
      {
        id: "override-root",
        parentId: null,
        status: "approved",
        outputKey: "out/override.png",
        format: "1:1",
        olharVerdict: { value: "confusa" },
        isPreview: false,
      },
    ];

    expect(isDerivationApprovalOverride(derivations[0]!)).toBe(true);
    expect(isDerivationPackageEligibleByVerdict(derivations[0]!)).toBe(true);
    expect(getPackageEligibleRoots(derivations).map((d) => d.id)).toEqual([
      "override-root",
    ]);

    const snapshot = buildApprovalPackageSnapshot({
      selectedRootIds: ["override-root"],
      derivations,
    });

    expect(snapshot.items[0]).toMatchObject({
      id: "override-root",
      approvalOverride: true,
      olharVerdictValue: "confusa",
    });
  });

  it("detects stale package when blocked export verdict is not override-approved", () => {
    const derivations = [
      {
        id: "root-1",
        parentId: null,
        status: "completed",
        outputKey: "out/root-1.png",
        format: "1:1",
        exportStatus: { value: "bloqueado" },
        isPreview: false,
      },
    ];

    const { isStale, staleReasons } = detectPackageStaleness({
      packageDerivationIds: ["root-1"],
      selectedRootIds: [],
      derivations,
    });

    expect(isStale).toBe(true);
    expect(staleReasons).toContain("unapproved:root-1");
    expect(staleReasons).toContain("blocked-export:bloqueado:root-1");
  });
});

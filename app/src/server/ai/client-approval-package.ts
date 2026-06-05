export type DerivationLike = {
  id: string;
  parentId?: string | null;
  status: string;
  outputKey?: string | null;
  format?: string | null;
  generationMode?: string | null;
  variantIndex?: number | null;
  ctaText?: string | null;
  isPreview?: boolean;
};

export type CampaignNotesContext = {
  notes?: string | null;
  product?: string | null;
  offer?: string | null;
};

export type ApprovalPackageItem = {
  id: string;
  parentId: string | null;
  format: string | null;
  status: string;
  generationMode: string | null;
  variantIndex: number | null;
  ctaText: string | null;
  creativeNote: string;
  hasOutput: boolean;
  isRoot: boolean;
};

export type ApprovalPackageSnapshot = {
  derivationIds: string[];
  items: ApprovalPackageItem[];
  notes: string;
  isStale: boolean;
  staleReasons: string[];
};

export function buildCreativeNote(
  derivation: DerivationLike,
  campaign?: CampaignNotesContext
): string {
  const parts: string[] = [];

  if (derivation.ctaText) {
    parts.push(`CTA: ${derivation.ctaText}`);
  }
  if (derivation.format) {
    parts.push(`Format: ${derivation.format}`);
  }
  if (derivation.generationMode) {
    parts.push(
      derivation.generationMode.replace(/_/g, " ")
    );
  }
  if (derivation.variantIndex != null) {
    parts.push(`Variant ${derivation.variantIndex + 1}`);
  }
  if (campaign?.offer) {
    parts.push(`Offer: ${campaign.offer}`);
  } else if (campaign?.product) {
    parts.push(`Product: ${campaign.product}`);
  }

  return parts.join(" · ") || "Approved creative";
}

export function getApprovedRootDerivations(
  derivations: DerivationLike[]
): DerivationLike[] {
  return derivations.filter(
    (d) =>
      d.status === "approved" &&
      !d.isPreview &&
      !d.parentId &&
      Boolean(d.outputKey)
  );
}

export function expandPackageDerivationIds(
  selectedRootIds: string[],
  derivations: DerivationLike[]
): string[] {
  const selected = new Set(selectedRootIds);
  const byParent = new Map<string, DerivationLike[]>();

  for (const derivation of derivations) {
    if (!derivation.parentId) continue;
    const siblings = byParent.get(derivation.parentId) ?? [];
    siblings.push(derivation);
    byParent.set(derivation.parentId, siblings);
  }

  const expanded: string[] = [];

  for (const rootId of selectedRootIds) {
    expanded.push(rootId);
    const children = byParent.get(rootId) ?? [];
    for (const child of children) {
      if (child.status === "approved" && child.outputKey) {
        expanded.push(child.id);
      }
    }
  }

  return expanded;
}

export function buildApprovalPackageItems(
  derivationIds: string[],
  derivations: DerivationLike[],
  campaign?: CampaignNotesContext
): ApprovalPackageItem[] {
  const byId = new Map(derivations.map((d) => [d.id, d]));
  const selectedRoots = new Set(
    derivationIds.filter((id) => {
      const d = byId.get(id);
      return d && !d.parentId;
    })
  );

  return derivationIds
    .map((id) => byId.get(id))
    .filter((d): d is DerivationLike => Boolean(d))
    .map((derivation) => ({
      id: derivation.id,
      parentId: derivation.parentId ?? null,
      format: derivation.format ?? null,
      status: derivation.status,
      generationMode: derivation.generationMode ?? null,
      variantIndex: derivation.variantIndex ?? null,
      ctaText: derivation.ctaText ?? null,
      creativeNote: buildCreativeNote(derivation, campaign),
      hasOutput: Boolean(derivation.outputKey),
      isRoot: selectedRoots.has(derivation.id) || !derivation.parentId,
    }));
}

export function detectPackageStaleness({
  packageDerivationIds,
  selectedRootIds,
  derivations,
}: {
  packageDerivationIds: string[];
  selectedRootIds: string[];
  derivations: DerivationLike[];
}): { isStale: boolean; staleReasons: string[] } {
  const byId = new Map(derivations.map((d) => [d.id, d]));
  const staleReasons: string[] = [];
  const expectedIds = expandPackageDerivationIds(selectedRootIds, derivations);
  const expectedSet = new Set(expectedIds);
  const packageSet = new Set(packageDerivationIds);

  for (const id of packageDerivationIds) {
    const derivation = byId.get(id);
    if (!derivation) {
      staleReasons.push(`missing:${id}`);
      continue;
    }
    if (derivation.status !== "approved") {
      staleReasons.push(`unapproved:${id}`);
    }
    if (!derivation.outputKey) {
      staleReasons.push(`no-output:${id}`);
    }
  }

  for (const id of expectedIds) {
    if (!packageSet.has(id)) {
      staleReasons.push(`outdated-selection:${id}`);
    }
  }

  for (const id of packageDerivationIds) {
    if (!expectedSet.has(id)) {
      staleReasons.push(`extra:${id}`);
    }
  }

  return { isStale: staleReasons.length > 0, staleReasons };
}

export function buildApprovalPackageSnapshot({
  selectedRootIds,
  derivations,
  campaign,
  packageDerivationIds,
}: {
  selectedRootIds: string[];
  derivations: DerivationLike[];
  campaign?: CampaignNotesContext;
  packageDerivationIds?: string[];
}): ApprovalPackageSnapshot {
  const expandedIds =
    packageDerivationIds ??
    expandPackageDerivationIds(selectedRootIds, derivations);

  const { isStale, staleReasons } = packageDerivationIds
    ? detectPackageStaleness({
        packageDerivationIds,
        selectedRootIds,
        derivations,
      })
    : { isStale: false, staleReasons: [] as string[] };

  return {
    derivationIds: expandedIds,
    items: buildApprovalPackageItems(expandedIds, derivations, campaign),
    notes: campaign?.notes?.trim() ?? "",
    isStale,
    staleReasons,
  };
}

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { workspaceAssets } from "../db/schema";
import { getApprovedTrainingReferences } from "../repositories/client-reference";
import { getBrandKit } from "../db/repositories/brand-kit";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
} from "../brand-training/contracts";
import type {
  CreativeWorkIdentityAssetSnapshot,
  CreativeWorkIdentitySnapshot,
  SocialPostBrief,
} from "./contracts";

/**
 * Default placement applied to exact-mode assets per category. Visual
 * references are never composited and therefore resolve to `null`.
 */
export const DEFAULT_EXACT_PLACEMENT = {
  logo: { gravity: "southeast", widthRatio: 0.18 },
  graphic: { gravity: "northwest", widthRatio: 0.35 },
  character: { gravity: "southeast", widthRatio: 0.42 },
  visual_reference: null,
} as const;

interface ApprovedReferenceRow {
  id: string;
  assetKey: string;
  label: string;
  trainingCategory: BrandTrainingCategory;
  usageMode: BrandTrainingUsageMode;
  trainingAnalysis: BrandTrainingAnalysis | null;
}

interface WorkspaceAssetRow {
  key: string;
  type: string;
  metadata: Record<string, unknown> | null;
}

type RecommendationGroup =
  | "logoExact"
  | "characterGraphicExact"
  | "visualReference"
  | "rule";

const TOKEN_NORMALIZE = /[^a-z0-9]+/g;

function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(TOKEN_NORMALIZE)
    .filter((token) => token.length > 0);
}

function buildBriefTokenSet(brief: SocialPostBrief): Set<string> {
  return new Set(
    [
      brief.theme,
      brief.objective,
      brief.audience,
      brief.offer,
    ]
      .flatMap(normalizeTokens)
  );
}

function overlapCount(text: string, briefTokens: Set<string>): number {
  if (!text) return 0;
  let count = 0;
  for (const token of normalizeTokens(text)) {
    if (briefTokens.has(token)) count += 1;
  }
  return count;
}

function classifyGroup(
  category: BrandTrainingCategory,
  usageMode: BrandTrainingUsageMode
): RecommendationGroup | null {
  if (usageMode === "rule") return "rule";
  if (usageMode === "exact" && category === "logo") return "logoExact";
  if (
    usageMode === "exact" &&
    (category === "character" || category === "graphic")
  ) {
    return "characterGraphicExact";
  }
  // `reference` mode (and visual_reference category) guide generation without
  // exact compositing. Logo/graphic/character assets are frequently approved
  // as `reference` when they lack an alpha channel — they must still appear
  // in Create Post identity options, otherwise a trained brand looks empty.
  if (category === "visual_reference" || usageMode === "reference") {
    return "visualReference";
  }
  return null;
}

const GROUP_ORDER: Record<RecommendationGroup, number> = {
  logoExact: 0,
  characterGraphicExact: 1,
  visualReference: 2,
  rule: 3,
};

function descriptionForGroup(
  ref: ApprovedReferenceRow,
  group: RecommendationGroup,
  briefOverlap: number,
  hasAlpha: boolean
): string {
  const mode = ref.usageMode;
  switch (group) {
    case "logoExact":
      return `Approved ${mode} logo asset; composited with default placement.`;
    case "characterGraphicExact":
      return `Approved ${mode} ${ref.trainingCategory} asset; composited with default placement.`;
    case "visualReference":
      return `Approved visual reference for stylistic guidance (overlap=${briefOverlap}).`;
    case "rule":
      return `Approved ${ref.trainingCategory} rule${hasAlpha ? "" : " (opaque, guidance only)"}.`;
  }
}

function pickDefaultPlacement(
  category: BrandTrainingCategory
): CreativeWorkIdentityAssetSnapshot["placement"] {
  switch (category) {
    case "logo":
      return { ...DEFAULT_EXACT_PLACEMENT.logo };
    case "graphic":
      return { ...DEFAULT_EXACT_PLACEMENT.graphic };
    case "character":
      return { ...DEFAULT_EXACT_PLACEMENT.character };
    case "visual_reference":
      return DEFAULT_EXACT_PLACEMENT.visual_reference;
  }
}

async function fetchAssetMetadata(
  workspaceId: string,
  assetKeys: string[]
): Promise<Map<string, WorkspaceAssetRow>> {
  const map = new Map<string, WorkspaceAssetRow>();
  if (assetKeys.length === 0) return map;
  const rows = await db
    .select({
      key: workspaceAssets.key,
      type: workspaceAssets.type,
      metadata: workspaceAssets.metadata,
    })
    .from(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.workspaceId, workspaceId),
        inArray(workspaceAssets.key, assetKeys)
      )
    );
  for (const row of rows) {
    map.set(row.key, row as WorkspaceAssetRow);
  }
  return map;
}

function hasAlphaFromMetadata(
  metadata: Record<string, unknown> | null | undefined
): boolean {
  return metadata?.hasAlpha === true;
}

function readAnalysisText(analysis: BrandTrainingAnalysis | null): string {
  if (!analysis) return "";
  return [
    analysis.description ?? "",
    ...(analysis.visualAttributes ?? []),
    ...(analysis.rules ?? []),
    ...(analysis.constraints ?? []),
  ].join(" ");
}

/**
 * Build a deterministic, category-priority ordered recommendation list of
 * approved references. Only approved references are surfaced. Token overlap
 * between brief fields and asset analysis text is used as a tie-breaker inside
 * each category group.
 */
export async function buildIdentityOptions(
  workspaceId: string,
  clientProfileId: string,
  brief: SocialPostBrief
): Promise<Array<CreativeWorkIdentityAssetSnapshot & { reason: string }>> {
  const refs = (await getApprovedTrainingReferences(
    workspaceId,
    clientProfileId
  )) as ApprovedReferenceRow[];

  const assetKeys = refs.map((r) => r.assetKey);
  const assetMeta = await fetchAssetMetadata(workspaceId, assetKeys);

  const briefTokens = buildBriefTokenSet(brief);

  const decorated = refs
    .map((ref) => {
      const group = classifyGroup(ref.trainingCategory, ref.usageMode);
      if (!group) return null;
      const meta = assetMeta.get(ref.assetKey);
      const hasAlpha = hasAlphaFromMetadata(meta?.metadata ?? null);
      const analysisText = readAnalysisText(ref.trainingAnalysis);
      const overlap = overlapCount(analysisText, briefTokens);
      return { ref, group, hasAlpha, overlap };
    })
    .filter(
      (entry): entry is { ref: ApprovedReferenceRow; group: RecommendationGroup; hasAlpha: boolean; overlap: number } =>
        entry !== null
    );

  decorated.sort((a, b) => {
    const groupDiff = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
    if (groupDiff !== 0) return groupDiff;
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return a.ref.id.localeCompare(b.ref.id);
  });

  return decorated.map(({ ref, group, hasAlpha, overlap }) => {
    const meta = assetMeta.get(ref.assetKey);
    const mimeType = meta?.type ?? "application/octet-stream";
    const placement = pickDefaultPlacement(ref.trainingCategory);
    return {
      referenceId: ref.id,
      assetKey: ref.assetKey,
      label: ref.label,
      category: ref.trainingCategory,
      usageMode: ref.usageMode,
      analysis: ref.trainingAnalysis as BrandTrainingAnalysis,
      mimeType,
      hasAlpha,
      placement,
      reason: descriptionForGroup(ref, group, overlap, hasAlpha),
    };
  });
}

interface CreateIdentitySnapshotInput {
  workspaceId: string;
  clientProfileId: string;
  selectedReferenceIds: string[];
}

export class IdentitySnapshotMissingReferenceError extends Error {
  readonly missingId: string;
  constructor(missingId: string) {
    super(`Selected reference ${missingId} is missing or not approved`);
    this.name = "IdentitySnapshotMissingReferenceError";
    this.missingId = missingId;
  }
}

export class IdentitySnapshotMissingAlphaError extends Error {
  readonly referenceId: string;
  readonly category: BrandTrainingCategory;
  constructor(referenceId: string, category: BrandTrainingCategory) {
    super(
      `Exact-mode ${category} reference ${referenceId} is missing transparency metadata (alpha channel).`
    );
    this.name = "IdentitySnapshotMissingAlphaError";
    this.referenceId = referenceId;
    this.category = category;
  }
}

/**
 * Reload approved rows server-side and reject any selected ID that is not
 * present. Reject exact-mode assets whose underlying workspace asset does not
 * declare transparency. Set `confirmedAt` server-side and snapshot only the
 * fields needed for reproducibility.
 */
export async function createIdentitySnapshot(
  input: CreateIdentitySnapshotInput
): Promise<CreativeWorkIdentitySnapshot> {
  const { workspaceId, clientProfileId, selectedReferenceIds } = input;

  const approved = (await getApprovedTrainingReferences(
    workspaceId,
    clientProfileId
  )) as ApprovedReferenceRow[];

  const approvedById = new Map(approved.map((row) => [row.id, row]));
  const effectiveReferenceIds =
    selectedReferenceIds.length > 0
      ? selectedReferenceIds
      : approved.slice(0, 3).map((row) => row.id);

  for (const id of effectiveReferenceIds) {
    if (!approvedById.has(id)) {
      throw new IdentitySnapshotMissingReferenceError(id);
    }
  }

  const selectedRows = effectiveReferenceIds.map(
    (id) => approvedById.get(id) as ApprovedReferenceRow
  );

  const assetMeta = await fetchAssetMetadata(
    workspaceId,
    selectedRows.map((row) => row.assetKey)
  );

  const assets: CreativeWorkIdentityAssetSnapshot[] = [];

  for (const ref of selectedRows) {
    const meta = assetMeta.get(ref.assetKey);
    const mimeType = meta?.type ?? "application/octet-stream";
    const hasAlpha = hasAlphaFromMetadata(meta?.metadata ?? null);

    if (ref.usageMode === "exact" && !hasAlpha) {
      throw new IdentitySnapshotMissingAlphaError(ref.id, ref.trainingCategory);
    }

    assets.push({
      referenceId: ref.id,
      assetKey: ref.assetKey,
      label: ref.label,
      category: ref.trainingCategory,
      usageMode: ref.usageMode,
      analysis: ref.trainingAnalysis as BrandTrainingAnalysis,
      mimeType,
      hasAlpha,
      placement: pickDefaultPlacement(ref.trainingCategory),
    });
  }

  const brandKit = await getBrandKit(workspaceId, clientProfileId);

  const colors = (brandKit?.brandColors as string[] | null | undefined) ?? [];
  const fonts = (brandKit?.brandFonts as string[] | null | undefined) ?? [];

  return {
    clientProfileId,
    confirmedAt: new Date().toISOString(),
    assets,
    brandKit: {
      colors,
      fonts,
      toneOfVoice: brandKit?.toneOfVoice ?? null,
      prohibitedElements: brandKit?.prohibitedElements ?? null,
      requiredElements: brandKit?.requiredElements ?? null,
    },
  };
}

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { workspaceAssets } from "../db/schema";
import {
  getApprovedTrainingReferences,
  getArchivedTrainingReferences,
} from "../repositories/client-reference";
import { getBrandKit } from "../repositories/brand-kit";
import type {
  BrandTrainingAnalysis,
  BrandTrainingCategory,
  BrandTrainingUsageMode,
} from "../brand-training/contracts";
import { approvedBrandFontAssets } from "../brand-training/font-assets";
import type {
  CreativeWorkFormat,
  CreativeWorkIdentityAssetSnapshot,
  CreativeWorkIdentitySnapshot,
  SocialPostBrief,
} from "./contracts";
import {
  selectReferences,
  type ReferenceCandidate,
  type ReferenceMediaType,
} from "./reference-selection";

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
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
      .filter((value): value is string => value !== null)
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

function referenceRequestSignals(brief: SocialPostBrief | null): {
  desiredCentralMessages: number | null;
  preferredMediaTypes: ReferenceMediaType[];
} {
  // ponytail: deterministic brief keywords until the brief contract exposes
  // explicit density/media fields; replace this inference when those exist.
  if (!brief) return { desiredCentralMessages: null, preferredMediaTypes: [] };
  const tokens = buildBriefTokenSet(brief);
  const hasAny = (...values: string[]) => values.some((value) => tokens.has(value));
  const preferredMediaTypes: ReferenceMediaType[] = [];
  if (hasAny("app", "plataforma", "software", "tela", "dashboard", "interface")) {
    preferredMediaTypes.push("device");
  }
  if (hasAny("foto", "retrato", "pessoa", "equipe", "professor", "professora")) {
    preferredMediaTypes.push("photo");
  }
  if (hasAny("ilustracao", "desenho", "personagem", "mascote")) {
    preferredMediaTypes.push("illustration");
  }
  if (hasAny("abstrato", "textura", "gradiente")) {
    preferredMediaTypes.push("abstract");
  }
  if (hasAny("beneficios", "vantagens", "passos", "lista", "comparativo", "itens")) {
    return { desiredCentralMessages: 3, preferredMediaTypes };
  }
  return { desiredCentralMessages: 1, preferredMediaTypes };
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
  brief: SocialPostBrief,
  format: CreativeWorkFormat | null = null,
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

  const ranked = pickReferenceIds(refs, brief, format, refs.length);
  const rankById = new Map(ranked.referenceIds.map((id, index) => [id, index]));
  decorated.sort(
    (a, b) =>
      (rankById.get(a.ref.id) ?? Number.MAX_SAFE_INTEGER) -
      (rankById.get(b.ref.id) ?? Number.MAX_SAFE_INTEGER),
  );

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
      reason:
        ranked.reasons[ref.id]?.join("; ") ??
        descriptionForGroup(ref, group, overlap, hasAlpha),
    };
  });
}

/**
 * Turn approved rows into the reference set that conditions one request (#178).
 *
 * Exact-mode assets are always carried: the placement policy composites them,
 * so they belong in the snapshot without competing for a style slot. The style
 * slots are ranked by `selectReferences` — requested format, layout archetype,
 * content density, brief overlap — never by insertion order.
 */
function pickReferenceIds(
  refs: ApprovedReferenceRow[],
  brief: SocialPostBrief | null,
  format: CreativeWorkFormat | null,
  limit?: number,
  operatorSelectedReferenceIds: string[] = [],
): {
  referenceIds: string[];
  reasons: Record<string, string[]>;
  strategy: "ranked" | "manual";
  operatorSelectedReferenceIds: string[];
} {
  const briefTokens = brief ? buildBriefTokenSet(brief) : new Set<string>();
  const candidates: ReferenceCandidate[] = refs.map((ref) => ({
    referenceId: ref.id,
    usageMode: ref.usageMode,
    analysis: ref.trainingAnalysis,
    briefOverlap:
      briefTokens.size > 0
        ? overlapCount(readAnalysisText(ref.trainingAnalysis), briefTokens)
        : 0,
  }));

  const exactIds = refs
    .filter((ref) => ref.usageMode === "exact")
    .sort((a, b) => {
      const aGroup = classifyGroup(a.trainingCategory, a.usageMode);
      const bGroup = classifyGroup(b.trainingCategory, b.usageMode);
      const groupDiff =
        (aGroup ? GROUP_ORDER[aGroup] : Number.MAX_SAFE_INTEGER) -
        (bGroup ? GROUP_ORDER[bGroup] : Number.MAX_SAFE_INTEGER);
      if (groupDiff !== 0) return groupDiff;
      const overlapDiff =
        overlapCount(readAnalysisText(b.trainingAnalysis), briefTokens) -
        overlapCount(readAnalysisText(a.trainingAnalysis), briefTokens);
      return overlapDiff !== 0 ? overlapDiff : a.id.localeCompare(b.id);
    })
    .map((ref) => ref.id);
  const ruleIds = refs
    .filter((ref) => ref.usageMode === "rule")
    .map((ref) => ref.id)
    .sort((a, b) => a.localeCompare(b));

  const selection = selectReferences({
    candidates,
    format,
    objective: brief?.objective ?? "",
    ...referenceRequestSignals(brief),
    limit,
  });

  const reasons: Record<string, string[]> = {};
  for (const id of exactIds) {
    reasons[id] = ["exact asset — composited, does not consume a style slot"];
  }
  for (const id of ruleIds) {
    reasons[id] = ["approved rule — textual guidance, does not consume a style slot"];
  }
  for (const entry of selection.selected) {
    reasons[entry.referenceId] = entry.reasons;
  }
  for (const id of operatorSelectedReferenceIds) {
    reasons[id] = ["operator override"];
  }

  const styleIds =
    operatorSelectedReferenceIds.length > 0
      ? operatorSelectedReferenceIds
      : selection.selected.map((entry) => entry.referenceId);

  return {
    referenceIds: [...new Set([...exactIds, ...styleIds, ...ruleIds])],
    reasons,
    strategy: operatorSelectedReferenceIds.length > 0 ? "manual" : "ranked",
    operatorSelectedReferenceIds,
  };
}

interface CreateIdentitySnapshotInput {
  workspaceId: string;
  clientProfileId: string;
  selectedReferenceIds: string[];
  /** Request context for the ranked fallback (#178). Absent = neutral ranking. */
  brief?: SocialPostBrief | null;
  format?: CreativeWorkFormat | null;
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

  const [approved, archived] = await Promise.all([
    getApprovedTrainingReferences(workspaceId, clientProfileId) as Promise<ApprovedReferenceRow[]>,
    getArchivedTrainingReferences(workspaceId, clientProfileId) as Promise<ApprovedReferenceRow[]>,
  ]);

  const approvedById = new Map(approved.map((row) => [row.id, row]));
  // #178: an operator choice always wins; without one the ranked selector
  // decides. Insertion order is never a fallback.
  const picked = pickReferenceIds(
    approved,
    input.brief ?? null,
    input.format ?? null,
    undefined,
    selectedReferenceIds,
  );
  const effectiveReferenceIds = picked.referenceIds;
  const referenceSelection: NonNullable<
    CreativeWorkIdentitySnapshot["referenceSelection"]
  > = {
    strategy: picked.strategy,
    format: input.format ?? null,
    operatorSelectedReferenceIds: picked.operatorSelectedReferenceIds,
    reasons: picked.reasons,
  };

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
  // ponytail: archived is today's rejection state; split the statuses if
  // neutral archival is introduced later.
  const negativePatterns = archived
    .filter((ref) => ref.trainingAnalysis != null)
    .map((ref) => ({
      referenceId: ref.id,
      label: ref.label,
      description: readAnalysisText(ref.trainingAnalysis),
    }))
    .filter((pattern) => pattern.description.length > 0)
    .sort((a, b) => a.referenceId.localeCompare(b.referenceId));

  const colors = (brandKit?.brandColors as string[] | null | undefined) ?? [];
  const fonts = (brandKit?.brandFonts as string[] | null | undefined) ?? [];
  const fontAssets = approvedBrandFontAssets(brandKit?.brandFontAssets ?? []);

  return {
    clientProfileId,
    confirmedAt: new Date().toISOString(),
    assets,
    referenceSelection,
    negativePatterns,
    brandKit: {
      colors,
      fonts,
      fontAssets,
      toneOfVoice: brandKit?.toneOfVoice ?? null,
      prohibitedElements: brandKit?.prohibitedElements ?? null,
      requiredElements: brandKit?.requiredElements ?? null,
    },
  };
}

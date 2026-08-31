import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import { getOpenAI } from "@/server/ai/utils";
import { env } from "@/server/validation/env";
import { approvedBrandFontAssets } from "@/server/brand-training/font-assets";
import { canonicalJsonStringify } from "./canonical-json";
import type {
  CarouselDeckPlanV1,
  CarouselLayoutFamily,
  CarouselLayoutPlan,
  CarouselTextRegion,
  CarouselVisualContractV1,
} from "./carousel-contracts";
import type {
  CreativeWorkIdentityAssetSnapshot,
  CreativeWorkIdentitySnapshot,
} from "./contracts";

/** Frozen 4:5/1:1 carousel canvas: the width is fixed, only the height scales. */
const CANVAS_WIDTH_PX = 1024;
const CANVAS_HEIGHT_PX: Record<"4:5" | "1:1", number> = { "4:5": 1280, "1:1": 1024 };
/** Uniform clear reserve kept around text and exact assets on every slide. */
const CAROUSEL_SAFE_AREA_PX = 64;
/** 1280 → 1024 vertical compression factor between the two supported formats. */
const SQUARE_Y_SCALE = 0.8;

const ANCHOR_BOARD_CELL_PX = 512;
const CONTACT_SHEET_CELL_PX = 256;
const CONTACT_SHEET_COLUMNS = 2;

function splitElements(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Square contain-box for one exact brand asset: the width follows the approved
 * placement ratio and x/y derive from the frozen gravity, the format's canvas
 * height and the safe area, with center gravity centered. This reuses the
 * approved placement instead of inventing a carousel-only positioning policy.
 */
function exactAssetSlotsForCarousel(input: {
  format: "4:5" | "1:1";
  assets: CreativeWorkIdentityAssetSnapshot[];
  safeAreaPx: number;
}): CarouselLayoutPlan["exactAssetSlots"] {
  const canvasHeight = CANVAS_HEIGHT_PX[input.format];
  const slots: CarouselLayoutPlan["exactAssetSlots"] = [];
  for (const asset of input.assets) {
    if (asset.usageMode !== "exact" || !asset.placement) continue;
    const width = Math.round(CANVAS_WIDTH_PX * asset.placement.widthRatio);
    const { gravity } = asset.placement;
    const x = gravity === "northwest" || gravity === "southwest"
      ? input.safeAreaPx
      : gravity === "northeast" || gravity === "southeast"
        ? CANVAS_WIDTH_PX - input.safeAreaPx - width
        : Math.round((CANVAS_WIDTH_PX - width) / 2);
    const y = gravity === "northwest" || gravity === "northeast"
      ? input.safeAreaPx
      : gravity === "southwest" || gravity === "southeast"
        ? canvasHeight - input.safeAreaPx - width
        : Math.round((canvasHeight - width) / 2);
    slots.push({ assetKey: asset.assetKey, x, y, width, height: width });
  }
  return slots;
}

type BaseLayoutFamily = Omit<CarouselLayoutPlan, "exactAssetSlots">;

/** Fixed 4:5 rhythm families at 1024×1280 (plan-authoritative numbers). */
const BASE_FAMILIES_4_5: Record<CarouselLayoutFamily, BaseLayoutFamily> = {
  impact: {
    id: "impact-v1",
    density: "high",
    primaryRegion: { x: 80, y: 96, width: 864, height: 420, minFontPx: 42, maxFontPx: 82, align: "left" },
    secondaryRegion: { x: 80, y: 920, width: 720, height: 180, minFontPx: 24, maxFontPx: 38, align: "left" },
    backgroundInstruction: "Text-free hero composition with one dominant focal area and the lower-right brand-asset reserve left clear.",
  },
  development: {
    id: "development-v1",
    density: "medium",
    primaryRegion: { x: 72, y: 112, width: 640, height: 300, minFontPx: 34, maxFontPx: 60, align: "left" },
    secondaryRegion: { x: 72, y: 790, width: 880, height: 270, minFontPx: 24, maxFontPx: 38, align: "left" },
    backgroundInstruction: "Text-free asymmetric composition with a clear reading path and all declared text and exact-asset regions unobstructed.",
  },
  respite: {
    id: "respite-v1",
    density: "low",
    primaryRegion: { x: 132, y: 330, width: 760, height: 320, minFontPx: 38, maxFontPx: 68, align: "center" },
    secondaryRegion: { x: 172, y: 720, width: 680, height: 170, minFontPx: 24, maxFontPx: 34, align: "center" },
    backgroundInstruction: "Text-free low-density composition with generous negative space around the centered reading area and exact assets.",
  },
};

function scaleRegionForSquare(region: CarouselTextRegion): CarouselTextRegion {
  return {
    ...region,
    y: Math.round(region.y * SQUARE_Y_SCALE),
    height: Math.round(region.height * SQUARE_Y_SCALE),
  };
}

function scaleFamiliesForSquare(
  families: Record<CarouselLayoutFamily, BaseLayoutFamily>
): Record<CarouselLayoutFamily, BaseLayoutFamily> {
  return {
    impact: {
      ...families.impact,
      primaryRegion: scaleRegionForSquare(families.impact.primaryRegion),
      secondaryRegion: families.impact.secondaryRegion
        ? scaleRegionForSquare(families.impact.secondaryRegion)
        : null,
    },
    development: {
      ...families.development,
      primaryRegion: scaleRegionForSquare(families.development.primaryRegion),
      secondaryRegion: families.development.secondaryRegion
        ? scaleRegionForSquare(families.development.secondaryRegion)
        : null,
    },
    respite: {
      ...families.respite,
      primaryRegion: scaleRegionForSquare(families.respite.primaryRegion),
      secondaryRegion: families.respite.secondaryRegion
        ? scaleRegionForSquare(families.respite.secondaryRegion)
        : null,
    },
  };
}

/**
 * Only approved font assets can win typography authority. Without one the
 * compositing contract records Pango's `sans` fallback with authority
 * "fallback" — no font package or binary asset is added.
 */
function resolveTypography(input: {
  identity: CreativeWorkIdentitySnapshot;
  selectedFontAssetKey?: string;
}): CarouselVisualContractV1["typography"] {
  const approved = approvedBrandFontAssets(input.identity.brandKit.fontAssets ?? []);
  const selected = input.selectedFontAssetKey
    ? approved.find((font) => font.assetKey === input.selectedFontAssetKey)
    : undefined;
  const font = selected ?? approved[0];
  return font
    ? { fontAssetKey: font.assetKey, fallbackFamily: null, authority: "approved" as const }
    : { fontAssetKey: null, fallbackFamily: "sans" as const, authority: "fallback" as const };
}

/**
 * Deterministic brand provenance hash. The confirmation timestamp is excluded
 * so re-preparing unchanged content reproduces the same contract hash.
 */
function brandSnapshotHashOf(identity: CreativeWorkIdentitySnapshot): string {
  const { confirmedAt: _confirmedAt, ...rest } = identity;
  return createHash("sha256").update(canonicalJsonStringify(rest)).digest("hex");
}

/**
 * Deterministic rhythm/layout contract for one carousel deck: three fixed
 * families, brand palette/typography, exact-asset slots and the canonical
 * SHA-256 contract hash over everything but the hash itself.
 */
export function buildCarouselVisualContract(input: {
  format: "4:5" | "1:1";
  identity: CreativeWorkIdentitySnapshot;
  temporaryReferenceId: string | null;
  selectedFontAssetKey?: string;
}): CarouselVisualContractV1 {
  const safeAreaPx = CAROUSEL_SAFE_AREA_PX;
  const exactAssetSlots = exactAssetSlotsForCarousel({
    format: input.format,
    assets: input.identity.assets,
    safeAreaPx,
  });
  const baseFamilies = input.format === "4:5"
    ? BASE_FAMILIES_4_5
    : scaleFamiliesForSquare(BASE_FAMILIES_4_5);
  const layoutFamilies = {
    impact: { ...baseFamilies.impact, exactAssetSlots },
    development: { ...baseFamilies.development, exactAssetSlots },
    respite: { ...baseFamilies.respite, exactAssetSlots },
  } satisfies CarouselVisualContractV1["layoutFamilies"];

  const withoutHash = {
    version: 1 as const,
    brandSnapshotHash: brandSnapshotHashOf(input.identity),
    temporaryReferenceId: input.temporaryReferenceId,
    palette: input.identity.brandKit.colors.filter((color) => color.trim().length > 0),
    typography: resolveTypography(input),
    // The first contract ships no global direction; revisions own it later.
    directionInstruction: null,
    layoutFamilies,
    recurringMotifs: [],
    exactAssetKeys: [...new Set(exactAssetSlots.map((slot) => slot.assetKey))],
    prohibitedElements: splitElements(input.identity.brandKit.prohibitedElements),
    safeAreaPx,
  };
  return {
    ...withoutHash,
    contractHash: createHash("sha256").update(canonicalJsonStringify(withoutHash)).digest("hex"),
  };
}

async function coverCell(buffer: Buffer, cellPx: number): Promise<Buffer> {
  return sharp(buffer)
    .resize(cellPx, cellPx, { fit: "cover" })
    .png()
    .toBuffer();
}

function sheetCanvas(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  });
}

/**
 * One horizontal PNG with three equally sized cells (cover, ceil-middle,
 * closing anchors), ordered by deck position.
 */
export async function buildCarouselAnchorBoard(input: {
  anchors: Array<{ position: number; buffer: Buffer }>;
}): Promise<Buffer> {
  const ordered = [...input.anchors].sort((left, right) => left.position - right.position);
  if (ordered.length === 0) {
    throw new Error("carousel_anchor_board_requires_anchors");
  }
  const cells = await Promise.all(ordered.map((anchor) => coverCell(anchor.buffer, ANCHOR_BOARD_CELL_PX)));
  return sheetCanvas(ANCHOR_BOARD_CELL_PX * cells.length, ANCHOR_BOARD_CELL_PX)
    .composite(cells.map((cell, index) => ({
      input: cell,
      left: index * ANCHOR_BOARD_CELL_PX,
      top: 0,
    })))
    .png()
    .toBuffer();
}

/**
 * One two-column PNG with every current slide in position order, used by the
 * advisory set review and the deck review UI.
 */
export async function buildCarouselContactSheet(input: {
  slides: Array<{ position: number; buffer: Buffer }>;
}): Promise<Buffer> {
  const ordered = [...input.slides].sort((left, right) => left.position - right.position);
  if (ordered.length === 0) {
    throw new Error("carousel_contact_sheet_requires_slides");
  }
  const rows = Math.ceil(ordered.length / CONTACT_SHEET_COLUMNS);
  const cells = await Promise.all(ordered.map((slide) => coverCell(slide.buffer, CONTACT_SHEET_CELL_PX)));
  return sheetCanvas(CONTACT_SHEET_CELL_PX * CONTACT_SHEET_COLUMNS, CONTACT_SHEET_CELL_PX * rows)
    .composite(cells.map((cell, index) => ({
      input: cell,
      left: (index % CONTACT_SHEET_COLUMNS) * CONTACT_SHEET_CELL_PX,
      top: Math.floor(index / CONTACT_SHEET_COLUMNS) * CONTACT_SHEET_CELL_PX,
    })))
    .png()
    .toBuffer();
}

const carouselSetReviewResponseSchema = z.object({
  warnings: z.array(z.string()),
}).strict();

const CAROUSEL_SET_REVIEW_SYSTEM_PROMPT = [
  "You are the advisory visual reviewer of pt-BR Instagram carousels for ADScale Studio.",
  "Return ONLY JSON: { warnings: string[] } with at most five short pt-BR warnings (max 200 characters each).",
  "Review only set-level composition coherence: recurring motifs, palette consistency, layout rhythm and exact-asset obstruction.",
  "You never judge copy, facts, prices or claims, never fail a slide and never request retries. An empty array means the set looks coherent.",
].join("\n");

function renderSetReviewPrompt(input: {
  deck: CarouselDeckPlanV1;
  contract: CarouselVisualContractV1;
}): string {
  return [
    "CONTRATO VISUAL CONGELADO:",
    `- paleta: ${input.contract.palette.join(", ") || "(não declarada)"}`,
    `- tipografia: authority=${input.contract.typography.authority}`,
    `- famílias de ritmo: ${Object.entries(input.contract.layoutFamilies)
      .map(([family, plan]) => `${family} (${plan.density})`)
      .join("; ")}`,
    `- instruções de fundo: ${Object.values(input.contract.layoutFamilies)
      .map((plan) => plan.backgroundInstruction)
      .join(" | ")}`,
    "",
    "DECK:",
    `- objetivo: ${input.deck.objective}`,
    `- formato: ${input.deck.format} com ${input.deck.slides.length} slides`,
    `- papéis: ${input.deck.slides.map((slide) => `${slide.position}:${slide.role}`).join(", ")}`,
    "",
    "A imagem anexada é a folha de contato do conjunto. Liste no máximo cinco avisos curtos de coerência visual.",
  ].join("\n");
}

/**
 * Advisory, non-blocking set review. Never fails a slide, never retries and
 * never spends beyond the single model call: a model failure degrades to one
 * `set_review_unavailable` warning. Under the controlled E2E provider the
 * review is disabled and returns no warnings.
 */
export async function reviewCarouselSet(input: {
  contactSheet: Buffer;
  deck: CarouselDeckPlanV1;
  contract: CarouselVisualContractV1;
}): Promise<string[]> {
  if (isE2EControlledProviderEnabled()) return [];
  try {
    const response = await getOpenAI().chat.completions.create({
      model: env.OPENAI_TEXT_MODEL,
      messages: [
        { role: "system", content: CAROUSEL_SET_REVIEW_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${input.contactSheet.toString("base64")}` } },
            { type: "text", text: renderSetReviewPrompt(input) },
          ],
        },
      ],
      response_format: zodResponseFormat(carouselSetReviewResponseSchema, "carousel_set_review"),
      max_completion_tokens: 600,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) return ["set_review_unavailable"];
    const parsed = carouselSetReviewResponseSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return ["set_review_unavailable"];
    return parsed.data.warnings
      .map((warning) => warning.trim().slice(0, 200))
      .filter((warning) => warning.length > 0)
      .slice(0, 5);
  } catch {
    return ["set_review_unavailable"];
  }
}

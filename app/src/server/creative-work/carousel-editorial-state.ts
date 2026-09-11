import { z } from "zod";
import { canonicalJsonStringify } from "./canonical-json";

export const CAROUSEL_EDITORIAL_VERSION = 1 as const;
export const CAROUSEL_EDITORIAL_MAX_SOURCES = 12;
export const CAROUSEL_EDITORIAL_MAX_CLAIMS = 32;
export const CAROUSEL_EDITORIAL_MAX_EVIDENCE_CHARS = 2000;
export const CAROUSEL_EDITORIAL_MAX_INSTRUCTION_CHARS = 1000;

const nonEmpty = z.string().trim().min(1);
const text240 = z.string().trim().max(240);
const text320 = z.string().trim().max(320);
const text400 = z.string().trim().max(400);
const text1000 = z.string().trim().max(CAROUSEL_EDITORIAL_MAX_INSTRUCTION_CHARS);
const httpUrl = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}, "httpUrlRequired");

export const researchSourceSchema = z.object({
  id: nonEmpty,
  url: httpUrl.nullable(),
  sourceId: nonEmpty.nullable(),
  title: text240.min(1),
  checkedOn: z.string().min(1).nullable(),
  publicationDate: z.string().min(1).nullable(),
  evidence: z.string().trim().max(CAROUSEL_EDITORIAL_MAX_EVIDENCE_CHARS),
  limitations: z.array(z.string().trim().min(1)).max(16),
  access: z.enum(["opened", "provided", "discovered"]),
}).strict().superRefine((value, context) => {
  if (value.access === "opened") {
    if (!value.url) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "openedSourceRequiresHttpUrl" });
    }
    if (!value.checkedOn) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["checkedOn"], message: "openedSourceRequiresCheckedOn" });
    }
  }
  if (value.access === "provided" && !value.sourceId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceId"], message: "providedSourceRequiresSourceId" });
  }
});
export type ResearchSource = z.infer<typeof researchSourceSchema>;

export const researchClaimSchema = z.object({
  id: nonEmpty,
  text: text1000.min(1),
  sourceIds: z.array(nonEmpty).max(12),
  kind: z.enum(["fact", "interpretation", "opinion"]),
  volatile: z.boolean(),
}).strict();
export type ResearchClaim = z.infer<typeof researchClaimSchema>;

export const carouselResearchSchema = z.object({
  status: z.enum(["ready", "not_needed", "insufficient", "unavailable"]),
  question: text1000,
  thesis: text1000,
  sources: z.array(researchSourceSchema).max(CAROUSEL_EDITORIAL_MAX_SOURCES),
  claims: z.array(researchClaimSchema).max(CAROUSEL_EDITORIAL_MAX_CLAIMS),
  gaps: z.array(z.string().trim().min(1)).max(32),
}).strict().superRefine((value, context) => {
  const sourceIds = new Set(value.sources.map((source) => source.id));
  const sustainingIds = new Set(
    value.sources
      .filter((source) => sourceSustainsClaim(source))
      .map((source) => source.id),
  );
  for (const [index, claim] of value.claims.entries()) {
    for (const [sourceIndex, sourceId] of claim.sourceIds.entries()) {
      if (!sourceIds.has(sourceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["claims", index, "sourceIds", sourceIndex],
          message: "claimSourceNotFound",
        });
      }
    }
    if (claim.sourceIds.length > 0 && !claim.sourceIds.some((sourceId) => sustainingIds.has(sourceId))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["claims", index, "sourceIds"],
        message: "discoveredSourceDoesNotSustainClaim",
      });
    }
  }
});
export type CarouselResearch = z.infer<typeof carouselResearchSchema>;

export const carouselHookSchema = z.object({
  id: nonEmpty,
  headline: text240.min(1),
  promise: text320.min(1),
  narrative: text400.min(1),
}).strict();
export type CarouselHook = z.infer<typeof carouselHookSchema>;

export const slideDirectionSchema = z.object({
  slideId: nonEmpty,
  learning: text320.min(1),
  representation: text400.min(1),
  hierarchy: text320.min(1),
  transition: text320.min(1),
  claimIds: z.array(nonEmpty).max(32),
}).strict();
export type SlideDirection = z.infer<typeof slideDirectionSchema>;

export const approvedCarouselCoverSchema = z.object({
  slideId: nonEmpty,
  scriptRevision: nonEmpty,
  preparedRevision: nonEmpty,
}).strict();
export type ApprovedCarouselCover = z.infer<typeof approvedCarouselCoverSchema>;

export const carouselEditorialStateSchema = z.object({
  version: z.literal(CAROUSEL_EDITORIAL_VERSION),
  revision: nonEmpty,
  contextHash: nonEmpty,
  research: carouselResearchSchema,
  hooks: z.array(carouselHookSchema).max(3),
  recommendedHookId: nonEmpty.nullable(),
  recommendation: text1000.nullable(),
  selectedHookId: nonEmpty.nullable(),
  storyboard: z.array(slideDirectionSchema).max(8),
  caption: text400.nullable(),
  approvedScriptRevision: nonEmpty.nullable(),
  approvedCover: approvedCarouselCoverSchema.nullable(),
  confirmedInteriorsRevision: nonEmpty.nullable(),
}).strict().superRefine((value, context) => {
  if (value.hooks.length !== 0 && value.hooks.length !== 3) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["hooks"], message: "hooksMustBeEmptyOrExactlyThree" });
  }
  const hookIds = value.hooks.map((hook) => hook.id);
  if (new Set(hookIds).size !== hookIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["hooks"], message: "hookIdsMustBeUnique" });
  }
  if (value.selectedHookId && !hookIds.includes(value.selectedHookId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedHookId"], message: "selectionMustPointIntoHooks" });
  }
  if (value.recommendedHookId && !hookIds.includes(value.recommendedHookId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["recommendedHookId"], message: "recommendationMustPointIntoHooks" });
  }
  const slideIds = value.storyboard.map((item) => item.slideId);
  if (new Set(slideIds).size !== slideIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["storyboard"], message: "storyboardSlideIdsMustBeUnique" });
  }
});
export type CarouselEditorialState = z.infer<typeof carouselEditorialStateSchema>;

export const carouselEditorialCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("propose_hooks") }).strict(),
  z.object({
    kind: z.literal("select_hook"),
    hookId: nonEmpty,
    headline: text240.min(1).optional(),
  }).strict(),
  z.object({
    kind: z.literal("revise_script"),
    instruction: z.string().trim().min(1).max(CAROUSEL_EDITORIAL_MAX_INSTRUCTION_CHARS),
  }).strict(),
  z.object({
    kind: z.literal("approve_script"),
    scriptRevision: nonEmpty,
  }).strict(),
  z.object({
    kind: z.literal("approve_cover"),
    slideId: nonEmpty,
    preparedRevision: nonEmpty,
  }).strict(),
]);
export type CarouselEditorialCommand = z.infer<typeof carouselEditorialCommandSchema>;

export type CarouselEditorialRevisionPayload = {
  context: unknown;
  selectedHook: CarouselHook | null;
  deck: unknown;
  storyboard: SlideDirection[];
  caption: string | null;
};

export function sourceSustainsClaim(source: ResearchSource): boolean {
  if (source.access === "discovered") return false;
  if (source.access === "opened") return Boolean(source.url && source.checkedOn);
  return Boolean(source.sourceId);
}

export function invalidateCarouselApprovals(state: CarouselEditorialState): CarouselEditorialState {
  return {
    ...state,
    approvedScriptRevision: null,
    approvedCover: null,
    confirmedInteriorsRevision: null,
  };
}

/** Visual remakes keep the approved script; only cover and lote releases are stale. */
export function invalidateCarouselProductionApprovals(
  state: CarouselEditorialState,
): CarouselEditorialState {
  return {
    ...state,
    approvedCover: null,
    confirmedInteriorsRevision: null,
  };
}

export function hasCurrentApprovedCarouselCover(
  state: CarouselEditorialState,
  scriptRevision: string,
  preparedRevision: string,
  coverSlideId: string,
): boolean {
  if (!scriptRevision || !preparedRevision || !coverSlideId) return false;
  if (!state.approvedScriptRevision || !state.approvedCover) return false;
  return state.approvedScriptRevision === scriptRevision
    && state.approvedCover.slideId === coverSlideId
    && state.approvedCover.scriptRevision === scriptRevision
    && state.approvedCover.preparedRevision === preparedRevision;
}

export function canDispatchCarouselInteriors(
  state: CarouselEditorialState,
  scriptRevision: string,
  preparedRevision: string,
  coverSlideId: string,
): boolean {
  if (!state.confirmedInteriorsRevision || state.confirmedInteriorsRevision !== preparedRevision) return false;
  return hasCurrentApprovedCarouselCover(state, scriptRevision, preparedRevision, coverSlideId);
}

export class CarouselGenerationGateError extends Error {
  readonly code = "invalid_generation_gate" as const;
  readonly details?: unknown;

  constructor(details?: unknown) {
    super("invalid_generation_gate");
    this.name = "CarouselGenerationGateError";
    this.details = details;
  }
}

export function authorizeCarouselSlideClaim(input: {
  editorial: CarouselEditorialState | null;
  generationScope: "cover" | "interiors" | undefined;
  scriptRevision: string | undefined;
  preparedRevision: string;
  slidePosition: number;
  coverSlideId: string | null;
}): boolean {
  const { editorial, generationScope, scriptRevision, preparedRevision, slidePosition, coverSlideId } = input;
  if (!editorial || !generationScope || !scriptRevision) return false;
  if (slidePosition === 1) {
    return editorial.approvedScriptRevision === scriptRevision;
  }
  if (generationScope === "cover") return false;
  if (!coverSlideId) return false;
  return canDispatchCarouselInteriors(editorial, scriptRevision, preparedRevision, coverSlideId);
}

export function storyboardCoversDeck(storyboard: SlideDirection[], deckSlideIds: string[]): boolean {
  const storyboardIds = storyboard.map((item) => item.slideId);
  if (storyboardIds.length !== deckSlideIds.length) return false;
  const deckSet = new Set(deckSlideIds);
  return storyboardIds.length === deckSet.size && storyboardIds.every((id) => deckSet.has(id));
}

export function readCarouselEditorial(settings: unknown): CarouselEditorialState | null {
  if (!settings || typeof settings !== "object") return null;
  const editorial = (settings as { carouselEditorial?: unknown }).carouselEditorial;
  if (editorial === undefined || editorial === null) return null;
  const parsed = carouselEditorialStateSchema.safeParse(editorial);
  return parsed.success ? parsed.data : null;
}

export function writeCarouselEditorial<T extends { carouselEditorial?: CarouselEditorialState }>(
  settings: T,
  editorial: CarouselEditorialState,
): T {
  return { ...settings, carouselEditorial: editorial };
}

export function withInvalidatedCarouselApprovals<T extends { carouselEditorial?: CarouselEditorialState }>(
  settings: T,
): T {
  if (!settings.carouselEditorial) return settings;
  return { ...settings, carouselEditorial: invalidateCarouselApprovals(settings.carouselEditorial) };
}

export function toPublicCarouselEditorial(state: CarouselEditorialState): CarouselEditorialState {
  return {
    version: 1,
    revision: state.revision,
    contextHash: state.contextHash,
    research: state.research,
    hooks: state.hooks,
    recommendedHookId: state.recommendedHookId,
    recommendation: state.recommendation,
    selectedHookId: state.selectedHookId,
    storyboard: state.storyboard,
    caption: state.caption,
    approvedScriptRevision: state.approvedScriptRevision,
    approvedCover: state.approvedCover,
    confirmedInteriorsRevision: state.confirmedInteriorsRevision,
  };
}

export function stripClientCarouselApprovals(
  incoming: CarouselEditorialState,
  persisted: CarouselEditorialState | null,
): CarouselEditorialState {
  return {
    ...incoming,
    approvedScriptRevision: persisted?.approvedScriptRevision ?? null,
    approvedCover: persisted?.approvedCover ?? null,
    confirmedInteriorsRevision: persisted?.confirmedInteriorsRevision ?? null,
  };
}

export function stripCarouselEditorialApprovalFields(
  editorial: CarouselEditorialState,
): CarouselEditorialState {
  return invalidateCarouselApprovals(editorial);
}

type SettingsWithEditorial = {
  carouselDraft?: unknown;
  carouselEditorial?: CarouselEditorialState;
};

function materialFingerprint(input: {
  request: string;
  settings: SettingsWithEditorial | null | undefined;
}): string {
  const editorial = readCarouselEditorial(input.settings);
  return canonicalJsonStringify({
    request: input.request,
    carouselDraft: input.settings?.carouselDraft ?? null,
    selectedHookId: editorial?.selectedHookId ?? null,
    hooks: editorial?.hooks ?? [],
    storyboard: editorial?.storyboard ?? [],
    caption: editorial?.caption ?? null,
    research: editorial?.research ?? null,
  });
}

export function isMaterialCarouselEditorialMutation(input: {
  persistedRequest: string;
  incomingRequest: string;
  persistedSettings: SettingsWithEditorial | null | undefined;
  incomingSettings: SettingsWithEditorial | null | undefined;
}): boolean {
  return materialFingerprint({ request: input.persistedRequest, settings: input.persistedSettings })
    !== materialFingerprint({ request: input.incomingRequest, settings: input.incomingSettings });
}

export function mergeCarouselEditorialForClientSettingsWrite<T extends SettingsWithEditorial>(input: {
  persistedRequest: string;
  incomingRequest: string;
  persistedSettings: SettingsWithEditorial | null | undefined;
  incomingSettings: T;
}): T {
  const persisted = readCarouselEditorial(input.persistedSettings);
  const incomingRaw = input.incomingSettings.carouselEditorial;
  let nextEditorial: CarouselEditorialState | null = persisted;
  if (incomingRaw !== undefined) {
    const grafted = {
      ...incomingRaw,
      approvedScriptRevision: persisted?.approvedScriptRevision ?? null,
      approvedCover: persisted?.approvedCover ?? null,
      confirmedInteriorsRevision: persisted?.confirmedInteriorsRevision ?? null,
    };
    const parsed = carouselEditorialStateSchema.safeParse(grafted);
    nextEditorial = parsed.success ? parsed.data : persisted;
  }

  const nextSettings = {
    ...input.incomingSettings,
    ...(nextEditorial ? { carouselEditorial: nextEditorial } : persisted ? { carouselEditorial: persisted } : {}),
  } as T;

  if (nextEditorial && isMaterialCarouselEditorialMutation({
    persistedRequest: input.persistedRequest,
    incomingRequest: input.incomingRequest,
    persistedSettings: input.persistedSettings,
    incomingSettings: nextSettings,
  })) {
    return { ...nextSettings, carouselEditorial: invalidateCarouselApprovals(nextEditorial) };
  }
  return nextSettings;
}

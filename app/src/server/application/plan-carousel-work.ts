import "server-only";
import { resolveCarouselPreparedSnapshot, type CarouselDraftStateV1 } from "../creative-work/carousel-contracts";
import type { CarouselEditorialFinding } from "../creative-work/carousel-editorial";
import {
  CarouselEditorialPlanInvalidError,
  lintCarouselDeck,
  proposeCarouselDraft,
  proposeCarouselHooks,
} from "../creative-work/carousel-editorial";
import {
  recomputeCarouselEditorialHashes,
  selectedCarouselHook,
} from "../creative-work/carousel-editorial-hash";
import {
  invalidateCarouselApprovals,
  readCarouselEditorial,
  toPublicCarouselEditorial,
  type CarouselEditorialCommand,
  type CarouselEditorialState,
} from "../creative-work/carousel-editorial-state";
import { researchCarousel } from "../creative-work/carousel-research";
import {
  buildCreativeWorkFactPack,
  creativeWorkFactPackBrandFromKit,
} from "../creative-work/fact-pack";
import type { CreativeWorkFactPack } from "../creative-work/contracts";
import type { CreativeWorkCarouselSlide, CreativeWorkItem, CreativeWorkSource } from "../db/schema";
import { getBrandKit } from "../repositories/brand-kit";
import {
  getCreativeWork,
  updateCreativeWorkDraftIfUnchanged,
  withCreativeWorkPreparationLock,
} from "../repositories/creative-work";
import { listCurrentCarouselSlides } from "../repositories/creative-work-carousel";

export type PlanCarouselWorkErrorCode =
  | "work_not_found"
  | "work_not_carousel"
  | "work_not_draft"
  | "sources_not_ready"
  | "stale_input"
  | "editorial_plan_invalid"
  | "research_unavailable"
  | "research_insufficient"
  | "invalid_editorial_transition";

export type PlanCarouselWorkResult =
  | {
      ok: true;
      value: {
        work: CreativeWorkItem;
        draft: CarouselDraftStateV1;
        findings: CarouselEditorialFinding[];
        editorial: CarouselEditorialState;
      };
    }
  | { ok: false; error: { code: PlanCarouselWorkErrorCode; details?: unknown } };

type Executor = Parameters<Parameters<typeof withCreativeWorkPreparationLock>[2]>[0];

type AuthorizedSnapshot = {
  work: CreativeWorkItem;
  sources: CreativeWorkSource[];
  factPack: CreativeWorkFactPack;
  requestContext: string;
  mergedAnswers: Record<string, string>;
  toneOfVoice: string | null;
  previous: CarouselDraftStateV1 | null;
  editorial: CarouselEditorialState;
};

type AuthorizeResult =
  | { ok: true; value: AuthorizedSnapshot }
  | { ok: false; error: { code: PlanCarouselWorkErrorCode; details?: unknown } };

const EXTERNAL_EVIDENCE_PATTERN =
  /\b(estudo|pesquisa mostra|segundo a|de acordo com|lei\s+n|ibge|oms\b|estatíst)/i;

/**
 * Loads the authorized snapshot, then releases the prepare lock before any
 * research or planner call. Persistence always re-reads and CAS-writes so a
 * late proposal cannot overwrite a newer draft.
 */
export async function planCarouselWork(input: {
  workspaceId: string;
  workItemId: string;
  expectedUpdatedAt: string;
  answers: Record<string, string>;
  command?: CarouselEditorialCommand;
}): Promise<PlanCarouselWorkResult> {
  const command = input.command ?? { kind: "propose_hooks" as const };

  if (command.kind === "approve_script" || command.kind === "approve_cover") {
    return withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (executor) => {
      const snapshot = await authorizeSnapshot(input, executor);
      if (!snapshot.ok) return snapshot;
      return command.kind === "approve_script"
        ? approveScript(input, command, snapshot.value, executor)
        : approveCover(input, command, snapshot.value, executor);
    });
  }

  if (command.kind === "select_hook") {
    const selected = await withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (executor) => {
      const snapshot = await authorizeSnapshot(input, executor);
      if (!snapshot.ok) return snapshot;
      return persistHookSelection(input, command, snapshot.value, executor);
    });
    if (!selected.ok) return selected;
    return proposeSelectedScript(input, selected.value);
  }

  const snapshot = await withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (executor) => (
    authorizeSnapshot(input, executor)
  ));
  if (!snapshot.ok) return snapshot;

  if (command.kind === "revise_script") {
    return reviseScript(input, command, snapshot.value);
  }
  return proposeHooks(input, snapshot.value);
}

async function authorizeSnapshot(
  input: {
    workspaceId: string;
    workItemId: string;
    expectedUpdatedAt: string;
    answers: Record<string, string>;
  },
  executor: Executor,
): Promise<AuthorizeResult> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId, executor);
  if (!aggregate) return { ok: false, error: { code: "work_not_found" } };
  const { work } = aggregate;
  if (work.toolKind !== "carousel") {
    return { ok: false, error: { code: "work_not_carousel", details: { toolKind: work.toolKind } } };
  }
  if (work.status !== "draft") {
    return { ok: false, error: { code: "work_not_draft", details: { status: work.status } } };
  }
  if (aggregate.sources.some((item) => item.status === "uploaded" || item.status === "analyzing")) {
    return { ok: false, error: { code: "sources_not_ready" } };
  }
  if (work.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    return { ok: false, error: { code: "stale_input" } };
  }

  const previous = work.settings.carouselDraft ?? null;
  const mergedAnswers = { ...(previous?.answers ?? {}), ...input.answers };
  const requestContext = [work.request.trim(), ...Object.entries(mergedAnswers).map(([field, value]) => `${field}: ${value.trim()}`)]
    .filter((line) => line.length > 0)
    .join("\n");
  const factualSources = aggregate.sources
    .filter((item) => item.status === "ready" && item.usage !== "style")
    .map((item) => ({ sourceId: item.id, usage: item.usage, content: item.contentAnalysis }));
  const brandKit = await getBrandKit(input.workspaceId, work.clientProfileId, executor);
  const factPack = buildCreativeWorkFactPack({
    request: requestContext,
    mode: "social_post",
    sources: factualSources,
    brand: creativeWorkFactPackBrandFromKit(brandKit),
    clientProfileId: work.clientProfileId,
  });

  return {
    ok: true,
    value: {
      work,
      sources: aggregate.sources,
      factPack,
      requestContext,
      mergedAnswers,
      toneOfVoice: brandKit?.toneOfVoice ?? null,
      previous,
      editorial: seedEditorial(work),
    },
  };
}

async function proposeHooks(
  input: { workspaceId: string; workItemId: string },
  snapshot: AuthorizedSnapshot,
): Promise<PlanCarouselWorkResult> {
  const research = await researchCarousel({
    request: snapshot.requestContext,
    factualSources: snapshot.sources
      .filter((item) => item.status === "ready" && item.usage !== "style")
      .map((item) => ({ sourceId: item.id, content: factualSourceText(item.contentAnalysis) })),
    needsExternalEvidence: requestNeedsExternalEvidence(snapshot.requestContext, snapshot.factPack),
  });

  if (research.status === "unavailable" || research.status === "insufficient") {
    const persisted = await persistEditorial(input, snapshot, {
      editorial: withEditorialPatch(snapshot, { research }),
      draft: snapshot.previous,
    });
    if (!persisted.ok) return persisted;
    return {
      ok: false,
      error: {
        code: research.status === "unavailable" ? "research_unavailable" : "research_insufficient",
        details: { gaps: research.gaps },
      },
    };
  }

  let hooksResult: Awaited<ReturnType<typeof proposeCarouselHooks>>;
  try {
    hooksResult = await proposeCarouselHooks({
      request: snapshot.requestContext,
      research,
      toneOfVoice: snapshot.toneOfVoice,
    });
  } catch (error) {
    return invalidPlan(error);
  }

  const editorial = withEditorialPatch(snapshot, {
    research,
    hooks: hooksResult.hooks,
    recommendedHookId: hooksResult.recommendedHookId,
    recommendation: hooksResult.recommendation,
    selectedHookId: null,
  });
  return persistEditorial(input, snapshot, { editorial, draft: snapshot.previous });
}

async function persistHookSelection(
  input: { workspaceId: string; workItemId: string },
  command: Extract<CarouselEditorialCommand, { kind: "select_hook" }>,
  snapshot: AuthorizedSnapshot,
  executor: Executor,
): Promise<AuthorizeResult> {
  if (snapshot.editorial.hooks.length !== 3 || !snapshot.editorial.hooks.some((hook) => hook.id === command.hookId)) {
    return { ok: false, error: { code: "invalid_editorial_transition" } };
  }
  const hooks = snapshot.editorial.hooks.map((hook) => (
    hook.id === command.hookId && command.headline ? { ...hook, headline: command.headline } : hook
  ));
  const editorial = withEditorialPatch(snapshot, { hooks, selectedHookId: command.hookId });
  const updated = await writeSettings(input, snapshot.work, { carouselEditorial: editorial }, executor);
  if (!updated) return { ok: false, error: { code: "stale_input" } };
  return {
    ok: true,
    value: {
      ...snapshot,
      work: updated,
      editorial,
    },
  };
}

async function proposeSelectedScript(
  input: { workspaceId: string; workItemId: string },
  snapshot: AuthorizedSnapshot,
): Promise<PlanCarouselWorkResult> {
  const selectedHook = selectedCarouselHook(snapshot.editorial);
  if (!selectedHook) return { ok: false, error: { code: "invalid_editorial_transition" } };
  return persistScriptProposal(input, snapshot, selectedHook, null);
}

async function reviseScript(
  input: { workspaceId: string; workItemId: string },
  command: Extract<CarouselEditorialCommand, { kind: "revise_script" }>,
  snapshot: AuthorizedSnapshot,
): Promise<PlanCarouselWorkResult> {
  const selectedHook = selectedCarouselHook(snapshot.editorial);
  if (!selectedHook) return { ok: false, error: { code: "invalid_editorial_transition" } };
  return persistScriptProposal(input, snapshot, selectedHook, command.instruction);
}

async function persistScriptProposal(
  input: { workspaceId: string; workItemId: string },
  snapshot: AuthorizedSnapshot,
  selectedHook: NonNullable<ReturnType<typeof selectedCarouselHook>>,
  revisionInstruction: string | null,
): Promise<PlanCarouselWorkResult> {
  let proposal: Awaited<ReturnType<typeof proposeCarouselDraft>>;
  try {
    proposal = await proposeCarouselDraft({
      workId: snapshot.work.id,
      request: snapshot.requestContext,
      answers: snapshot.mergedAnswers,
      previous: snapshot.previous,
      factPack: snapshot.factPack,
      toneOfVoice: snapshot.toneOfVoice,
      selectedHook,
      research: snapshot.editorial.research,
      previousStoryboard: snapshot.editorial.storyboard,
      revisionInstruction,
    });
  } catch (error) {
    return invalidPlan(error);
  }

  const editorial = withEditorialPatch(snapshot, {
    storyboard: proposal.storyboard,
    caption: proposal.caption,
  }, proposal.draft);
  return persistEditorial(input, snapshot, { editorial, draft: proposal.draft });
}

async function approveScript(
  input: { workspaceId: string; workItemId: string },
  command: Extract<CarouselEditorialCommand, { kind: "approve_script" }>,
  snapshot: AuthorizedSnapshot,
  executor: Executor,
): Promise<PlanCarouselWorkResult> {
  const draft = snapshot.previous;
  if (!draft?.plan) return { ok: false, error: { code: "invalid_editorial_transition" } };
  const editorial = recomputeCarouselEditorialHashes(snapshot.editorial, {
    request: snapshot.work.request,
    deck: draft,
  });
  if (editorial.revision !== command.scriptRevision) {
    return { ok: false, error: { code: "invalid_editorial_transition" } };
  }
  const blocking = lintCarouselDeck({ deck: draft.plan, factPack: snapshot.factPack }).filter((finding) => finding.blocking);
  if (blocking.length > 0) {
    return { ok: false, error: { code: "invalid_editorial_transition", details: { findings: blocking } } };
  }
  if (editorial.approvedScriptRevision === command.scriptRevision) {
    return success(snapshot.work, draft, [], editorial);
  }
  const approved = { ...editorial, approvedScriptRevision: command.scriptRevision };
  const updated = await writeSettings(
    input,
    snapshot.work,
    { carouselDraft: draft, carouselEditorial: approved },
    executor,
    true,
  );
  if (!updated) return { ok: false, error: { code: "stale_input" } };
  return success(updated, draft, [], approved);
}

async function approveCover(
  input: { workspaceId: string; workItemId: string },
  command: Extract<CarouselEditorialCommand, { kind: "approve_cover" }>,
  snapshot: AuthorizedSnapshot,
  executor: Executor,
): Promise<PlanCarouselWorkResult> {
  const draft = snapshot.previous;
  if (!draft?.plan || !snapshot.editorial.approvedScriptRevision) {
    return { ok: false, error: { code: "invalid_editorial_transition" } };
  }
  const prepared = resolveCarouselPreparedSnapshot(snapshot.work.inputSnapshot);
  if (!prepared || prepared.preparedRevision !== command.preparedRevision) {
    return { ok: false, error: { code: "invalid_editorial_transition" } };
  }
  const slides = await listCurrentCarouselSlides(input.workspaceId, input.workItemId, executor);
  const cover = slides.find((slide) => isCoverPiece(slide, command.slideId, input));
  if (!cover || !isApprovableCover(cover)) {
    return { ok: false, error: { code: "invalid_editorial_transition" } };
  }
  const already = snapshot.editorial.approvedCover;
  if (
    already
    && already.slideId === command.slideId
    && already.preparedRevision === command.preparedRevision
    && already.scriptRevision === snapshot.editorial.approvedScriptRevision
  ) {
    return success(snapshot.work, draft, [], snapshot.editorial);
  }
  const editorial: CarouselEditorialState = {
    ...snapshot.editorial,
    approvedCover: {
      slideId: command.slideId,
      scriptRevision: snapshot.editorial.approvedScriptRevision,
      preparedRevision: command.preparedRevision,
    },
  };
  const updated = await writeSettings(
    input,
    snapshot.work,
    { carouselDraft: draft, carouselEditorial: editorial },
    executor,
    true,
  );
  if (!updated) return { ok: false, error: { code: "stale_input" } };
  return success(updated, draft, [], editorial);
}

async function persistEditorial(
  input: { workspaceId: string; workItemId: string },
  snapshot: AuthorizedSnapshot,
  next: { editorial: CarouselEditorialState; draft: CarouselDraftStateV1 | null },
): Promise<PlanCarouselWorkResult> {
  const current = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!current) return { ok: false, error: { code: "work_not_found" } };
  if (current.work.updatedAt.toISOString() !== snapshot.work.updatedAt.toISOString()) {
    return { ok: false, error: { code: "stale_input" } };
  }
  const draft = next.draft ?? snapshot.previous ?? emptyDraft();
  const findings = draft.plan ? lintCarouselDeck({ deck: draft.plan, factPack: snapshot.factPack }) : [];
  const updated = await writeSettings(input, snapshot.work, {
    carouselDraft: next.draft === undefined ? snapshot.previous : next.draft,
    carouselEditorial: next.editorial,
  });
  if (!updated) return { ok: false, error: { code: "stale_input" } };
  return success(updated, next.draft ?? snapshot.previous ?? emptyDraft(), findings, next.editorial);
}

async function writeSettings(
  input: { workspaceId: string; workItemId: string },
  work: CreativeWorkItem,
  settingsPatch: { carouselDraft?: CarouselDraftStateV1 | null; carouselEditorial?: CarouselEditorialState },
  executor?: Executor,
  persistCarouselApprovals = false,
): Promise<CreativeWorkItem | null> {
  const settings = {
    ...work.settings,
    ...(settingsPatch.carouselDraft !== undefined ? { carouselDraft: settingsPatch.carouselDraft ?? undefined } : {}),
    ...(settingsPatch.carouselEditorial ? { carouselEditorial: settingsPatch.carouselEditorial } : {}),
  };
  return updateCreativeWorkDraftIfUnchanged(
    input.workspaceId,
    input.workItemId,
    work.updatedAt,
    { settings },
    executor,
    persistCarouselApprovals ? { persistCarouselApprovals: true } : undefined,
  );
}

function success(
  work: CreativeWorkItem,
  draft: CarouselDraftStateV1,
  findings: CarouselEditorialFinding[],
  editorial: CarouselEditorialState,
): PlanCarouselWorkResult {
  return {
    ok: true,
    value: {
      work,
      draft,
      findings,
      editorial: toPublicCarouselEditorial(readCarouselEditorial(work.settings) ?? editorial),
    },
  };
}

function invalidPlan(error: unknown): PlanCarouselWorkResult {
  if (error instanceof CarouselEditorialPlanInvalidError) {
    return { ok: false, error: { code: "editorial_plan_invalid", details: { message: error.message } } };
  }
  throw error;
}

function seedEditorial(work: CreativeWorkItem): CarouselEditorialState {
  const existing = readCarouselEditorial(work.settings);
  if (existing) return existing;
  return recomputeCarouselEditorialHashes({
    version: 1,
    revision: "pending",
    contextHash: "pending",
    research: { status: "not_needed", question: "", thesis: "", sources: [], claims: [], gaps: [] },
    hooks: [],
    recommendedHookId: null,
    recommendation: null,
    selectedHookId: null,
    storyboard: [],
    caption: null,
    approvedScriptRevision: null,
    approvedCover: null,
    confirmedInteriorsRevision: null,
  }, { request: work.request, deck: work.settings.carouselDraft ?? null });
}

function withEditorialPatch(
  snapshot: AuthorizedSnapshot,
  patch: Partial<CarouselEditorialState>,
  deck: CarouselDraftStateV1 | null = snapshot.previous,
): CarouselEditorialState {
  return recomputeCarouselEditorialHashes(
    invalidateCarouselApprovals({ ...snapshot.editorial, ...patch }),
    { request: snapshot.work.request, deck },
  );
}

function requestNeedsExternalEvidence(request: string, factPack: CreativeWorkFactPack): boolean {
  if (EXTERNAL_EVIDENCE_PATTERN.test(request)) return true;
  return factPack.facts.some((fact) => fact.origin === "request" && (fact.class === "proof" || fact.class === "credential"));
}

function factualSourceText(content: CreativeWorkSource["contentAnalysis"]): string {
  if (!content) return "";
  return [
    content.product,
    content.offer,
    content.cta?.text,
    content.keyVisual,
    content.textContent?.headline,
    ...(content.textContent?.bullets ?? []),
  ].filter((part): part is string => Boolean(part && part.trim())).join("\n");
}

function isCoverPiece(
  slide: CreativeWorkCarouselSlide,
  slideId: string,
  input: { workspaceId: string; workItemId: string },
): boolean {
  if (slide.workspaceId !== input.workspaceId || slide.workItemId !== input.workItemId) return false;
  if (!slide.isCurrent || slide.position !== 1) return false;
  return slide.id === slideId;
}

function isApprovableCover(slide: CreativeWorkCarouselSlide): boolean {
  if (slide.status !== "completed") return false;
  if (slide.errorCode === "objective_failed") return false;
  const quality = slide.quality as { objectivePassed?: unknown } | null;
  return quality?.objectivePassed !== false;
}

function emptyDraft(): CarouselDraftStateV1 {
  return { version: 1, revision: "empty", answers: {}, blockingQuestions: [], plan: null, changes: [] };
}

import {
  sourceSustainsClaim,
  type CarouselEditorialState,
  type ResearchSource,
  type SlideDirection,
} from "@/server/creative-work/carousel-editorial-state";
import { quoteCarouselUnits } from "@/server/creative-work/carousel-contracts";

export type CarouselComposerPhase =
  | "questions"
  | "entry"
  | "researching"
  | "hooks"
  | "sequence"
  | "ready_to_generate"
  | "generating"
  | "cover_review"
  | "review";

export const CAROUSEL_COVER_QUOTE = quoteCarouselUnits(1);

export function eligibleInteriorDraftCount(
  slides: Array<{ position: number; status: string }>,
): number {
  return slides.filter((slide) => slide.position !== 1 && (slide.status === "draft" || slide.status === "failed")).length;
}

export function quoteCarouselInteriorsLote(input: {
  slides: Array<{ position: number; status: string }>;
  planSlideCount: number;
  preparedOutputCount: number | null | undefined;
}): { unitCount: number; credits: number } {
  const remaining = eligibleInteriorDraftCount(input.slides);
  if (remaining > 0) {
    return quoteCarouselUnits(remaining);
  }
  if (typeof input.preparedOutputCount === "number" && input.preparedOutputCount > 1) {
    return quoteCarouselUnits(input.preparedOutputCount);
  }
  return quoteCarouselUnits(Math.max(input.planSlideCount - 1, 0));
}

export function deriveCarouselComposerPhase(input: {
  blockingQuestionCount: number;
  hasPlan: boolean;
  preparedRevision: string | null;
  slides: Array<{ position: number; status: string }>;
  hooks: Array<{ id: string }>;
  selectedHookId: string | null;
  researching: boolean;
}): CarouselComposerPhase {
  if (input.blockingQuestionCount > 0) return "questions";
  const hasHooks = input.hooks.length === 3;
  if (input.researching && !hasHooks) return "researching";
  if (hasHooks && !input.selectedHookId) return "hooks";

  const anyActive = input.slides.some((slide) => slide.status === "queued" || slide.status === "processing");
  if (anyActive) return "generating";

  const cover = input.slides.find((slide) => slide.position === 1);
  const interiors = input.slides.filter((slide) => slide.position !== 1);
  if (cover?.status === "completed" && interiors.every((slide) => slide.status === "draft")) {
    return "cover_review";
  }

  if (input.slides.length > 0) return "review";
  if (input.preparedRevision) return "ready_to_generate";
  if (input.hasPlan || input.selectedHookId) return "sequence";
  return "entry";
}

export function safeCarouselHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function publishableCarouselSources(editorial: CarouselEditorialState | null): ResearchSource[] {
  return (editorial?.research.sources ?? []).filter(sourceSustainsClaim);
}

export function carouselStoryboardForSlide(
  editorial: CarouselEditorialState | null,
  slide: { id: string; planSlideId?: string | null },
): SlideDirection | null {
  if (!editorial) return null;
  const planId = slide.planSlideId || slide.id;
  return editorial.storyboard.find((item) => item.slideId === planId) ?? null;
}

export function isCurrentCoverApproval(input: {
  editorial: CarouselEditorialState | null;
  slideId: string;
  preparedRevision: string;
}): boolean {
  const cover = input.editorial?.approvedCover;
  if (!cover || !input.editorial?.approvedScriptRevision) return false;
  return cover.slideId === input.slideId
    && cover.preparedRevision === input.preparedRevision
    && cover.scriptRevision === input.editorial.approvedScriptRevision;
}

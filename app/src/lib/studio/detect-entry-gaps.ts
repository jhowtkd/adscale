import {
  filterProtocols,
  GENERIC_AUDIENCE_IDS,
  GENERIC_OFFER_IDS,
  genericProtocolIds,
  requestMentionsEntryValue,
} from "./entry-catalog";
import type { EntryChip, EntryContext, EntryProtocol, EntrySlot } from "./entry-types";

function requestCovers(request: string, slot: EntrySlot, values: Array<string | null | undefined>) {
  return values.some((value) => Boolean(value?.trim()) && requestMentionsEntryValue(request, slot, value!));
}

export function detectEntryGaps(input: {
  context: EntryContext;
  request: string;
  hasAttachment: boolean;
  carouselEnabled: boolean;
}): EntryChip[] {
  void input.hasAttachment;
  const protocolFact: EntryProtocol | null = input.carouselEnabled
    ? input.context.protocol
    : input.context.protocol === "carousel"
      ? null
      : input.context.protocol;

  const uniqueProtocolOptions = Array.from(new Set(
    input.context.workCount === 0
      ? genericProtocolIds(input.carouselEnabled)
      : filterProtocols(input.context.protocolCandidates, input.carouselEnabled),
  ));

  const chips: EntryChip[] = [];
  const push = (slot: EntrySlot, options: string[]) => {
    if (chips.length >= 3 || options.length === 0) return;
    chips.push({ slot, options });
  };

  const protocolCoveredByRequest = requestCovers(
    input.request,
    "protocol",
    protocolFact
      ? [protocolFact]
      : [...uniqueProtocolOptions, ...genericProtocolIds(input.carouselEnabled)],
  );
  if (!protocolFact && !protocolCoveredByRequest) {
    const options = uniqueProtocolOptions.length > 0
      ? uniqueProtocolOptions
      : genericProtocolIds(input.carouselEnabled);
    push("protocol", options);
  }

  const offerKnown = Boolean(input.context.offer)
    || requestCovers(input.request, "offer", [input.context.offer, ...input.context.offerCandidates, ...GENERIC_OFFER_IDS]);
  // Absence of an offer must not invent one. Generic catalog labels
  // (launch/promo) only close a gap the operator already wrote.
  if (!offerKnown && input.context.offerCandidates.length > 0) {
    push("offer", input.context.offerCandidates);
  }

  const audienceKnown = Boolean(input.context.audience)
    || requestCovers(input.request, "audience", [input.context.audience, ...input.context.audienceCandidates, ...GENERIC_AUDIENCE_IDS]);
  if (!audienceKnown) {
    push("audience", input.context.audienceCandidates.length > 0 ? input.context.audienceCandidates : [...GENERIC_AUDIENCE_IDS]);
  }

  const toneKnown = Boolean(input.context.tone) || requestCovers(input.request, "tone", [input.context.tone, ...input.context.toneCandidates]);
  if (!toneKnown && input.context.toneCandidates.length > 0) {
    push("tone", input.context.toneCandidates);
  }

  return chips;
}

export function shouldHideProtocolSwitcher(
  interview: {
    enabled?: boolean;
    showContinue?: boolean;
    chips: Array<{ slot: string }>;
    answers: Partial<Record<string, string>>;
  } | null | undefined,
  options: {
    placement?: "center" | "dock";
    suggestedProtocol?: string | null;
    intent?: string | null;
  } = {},
): boolean {
  if (interview?.enabled) {
    return Boolean(
      interview.showContinue
      || (interview.chips.some((chip) => chip.slot === "protocol") && !interview.answers.protocol),
    );
  }
  // First visit: one request + Começar on a single piece. Other protocols keep
  // the radios so advanced settings stay reachable.
  return options.placement === "center"
    && !options.suggestedProtocol
    && (options.intent == null || options.intent === "single");
}

/** First visit Começar is a single piece. Open work hydrates; Arte keeps variations. */
export function firstVisitComposerIntent(input: {
  initialIntent?: "variations" | "single" | "format_adaptation" | "restyle" | "carousel";
  studioMode?: "arte" | "briefing";
  workId?: string;
}): "variations" | "single" | "format_adaptation" | "restyle" | "carousel" | undefined {
  if (input.initialIntent) return input.initialIntent;
  if (input.workId) return undefined;
  if (input.studioMode === "arte") return "variations";
  return "single";
}

import {
  filterProtocols,
  GENERIC_AUDIENCE_IDS,
  GENERIC_OFFER_IDS,
  genericProtocolIds,
} from "./entry-catalog";
import type { EntryChip, EntryContext, EntryProtocol, EntrySlot } from "./entry-types";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function requestCovers(request: string, values: Array<string | null | undefined>) {
  const haystack = normalize(request);
  if (!haystack) return false;
  return values.some((value) => {
    if (!value?.trim()) return false;
    return haystack.includes(normalize(value));
  });
}

export function detectEntryGaps(input: {
  context: EntryContext;
  request: string;
  hasAttachment: boolean;
  carouselEnabled: boolean;
}): EntryChip[] {
  void input.hasAttachment;
  const protocolCandidates = filterProtocols(
    input.context.protocol ? [input.context.protocol, ...input.context.protocolCandidates] : input.context.protocolCandidates,
    input.carouselEnabled,
  );
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

  if (!protocolFact) {
    const options = uniqueProtocolOptions.length > 0
      ? uniqueProtocolOptions
      : genericProtocolIds(input.carouselEnabled);
    push("protocol", options);
  }

  const offerKnown = Boolean(input.context.offer) || requestCovers(input.request, [input.context.offer, ...input.context.offerCandidates]);
  if (!offerKnown) {
    push("offer", input.context.offerCandidates.length > 0 ? input.context.offerCandidates : [...GENERIC_OFFER_IDS]);
  }

  const audienceKnown = Boolean(input.context.audience) || requestCovers(input.request, [input.context.audience, ...input.context.audienceCandidates]);
  if (!audienceKnown) {
    push("audience", input.context.audienceCandidates.length > 0 ? input.context.audienceCandidates : [...GENERIC_AUDIENCE_IDS]);
  }

  const toneKnown = Boolean(input.context.tone) || requestCovers(input.request, [input.context.tone, ...input.context.toneCandidates]);
  if (!toneKnown && input.context.toneCandidates.length > 0) {
    push("tone", input.context.toneCandidates);
  }

  return chips;
}

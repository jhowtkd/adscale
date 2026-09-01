import { filterProtocols } from "@/lib/studio/entry-catalog";
import type { EntryContext, EntryProtocol } from "@/lib/studio/entry-types";

export type StudioEntryHistoryRow = {
  origin: "creative_work" | "campaign";
  id: string;
  updatedAt: Date;
  toolKind: string | null;
  offer?: string | null;
  product?: string | null;
  audience?: string | null;
  tone?: string | null;
  inferredOffer?: { value: string | null; state: string; confidence?: string };
  inferredAudience?: { value: string | null; state: string; confidence?: string };
  inferredTone?: { value: string | null; state: string; confidence?: string };
  offerOverride?: string | null;
  audienceOverride?: string | null;
  toneOverride?: string | null;
};

export type StudioEntryKit = {
  toneOfVoice: string | null;
  toneNotes: string | null;
  description: string | null;
};

type InferredSlot = {
  value: string | null;
  state: string;
  confidence?: string;
};

type SlotName = "offer" | "audience" | "tone";

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isFactEligible(field: InferredSlot | undefined): field is InferredSlot & { value: string } {
  if (!field || field.value === null) return false;
  if (field.state === "sourced") return true;
  return field.state === "inferred" && field.confidence === "high";
}

function candidateFromInferred(field: InferredSlot | undefined): string | null {
  if (!field || field.value === null) return null;
  if (isFactEligible(field)) return null;
  return field.value;
}

function inferredField(row: StudioEntryHistoryRow, slot: SlotName): InferredSlot | undefined {
  if (slot === "offer") return row.inferredOffer;
  if (slot === "audience") return row.inferredAudience;
  return row.inferredTone;
}

function overrideField(row: StudioEntryHistoryRow, slot: SlotName): string | null | undefined {
  if (slot === "offer") return row.offerOverride;
  if (slot === "audience") return row.audienceOverride;
  return row.toneOverride;
}

function extractCreativeWorkSlot(
  row: StudioEntryHistoryRow,
  slot: SlotName,
): { fact?: string; candidate?: string } {
  const override = nonEmpty(overrideField(row, slot));
  if (override) return { fact: override };

  const inferred = inferredField(row, slot);
  if (isFactEligible(inferred)) return { fact: inferred.value };

  const candidate = candidateFromInferred(inferred);
  if (candidate) return { candidate };

  return {};
}

function extractCampaignSlot(
  row: StudioEntryHistoryRow,
  slot: SlotName,
): { fact?: string } {
  if (slot === "offer") {
    const value = nonEmpty(row.offer ?? row.product);
    return value ? { fact: value } : {};
  }

  const value = nonEmpty(row[slot]);
  return value ? { fact: value } : {};
}

function resolveMajority(values: string[]): { fact: string | null; unique: string[] } {
  const unique = [...new Set(values)];
  if (values.length === 0) return { fact: null, unique: [] };

  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  for (const [value, count] of counts) {
    if (count > values.length / 2) {
      return { fact: value, unique };
    }
  }

  return { fact: null, unique };
}

function resolveProtocol(
  rows: StudioEntryHistoryRow[],
  carouselEnabled: boolean,
): Pick<EntryContext, "protocol" | "protocolCandidates"> {
  const toolKinds = rows
    .filter((row) => row.origin === "creative_work")
    .map((row) => row.toolKind)
    .filter((value): value is string => value !== null);

  const protocols = filterProtocols(toolKinds, carouselEnabled);
  if (protocols.length === 0) {
    return { protocol: null, protocolCandidates: [] };
  }

  const unique = [...new Set(protocols)];
  const allSame = unique.length === 1;
  if (allSame) {
    return { protocol: unique[0] as EntryProtocol, protocolCandidates: unique };
  }

  return { protocol: null, protocolCandidates: unique };
}

function resolveTextSlot(
  rows: StudioEntryHistoryRow[],
  slot: SlotName,
): { fact: string | null; candidates: string[] } {
  const factValues: string[] = [];
  const candidateValues: string[] = [];

  for (const row of rows) {
    const extracted = row.origin === "campaign"
      ? extractCampaignSlot(row, slot)
      : extractCreativeWorkSlot(row, slot);

    if (extracted.fact) factValues.push(extracted.fact);
    if ("candidate" in extracted && extracted.candidate) {
      candidateValues.push(extracted.candidate);
    }
  }

  const { fact, unique } = resolveMajority(factValues);
  const candidates = [...new Set([...unique, ...candidateValues])];
  return { fact, candidates };
}

export function projectStudioEntryContext(input: {
  rows: StudioEntryHistoryRow[];
  kit: StudioEntryKit;
  carouselEnabled: boolean;
}): EntryContext {
  const { rows, kit, carouselEnabled } = input;
  const protocolResult = resolveProtocol(rows, carouselEnabled);
  const offerResult = resolveTextSlot(rows, "offer");
  const audienceResult = resolveTextSlot(rows, "audience");
  const toneResult = resolveTextSlot(rows, "tone");

  let offer = offerResult.fact;
  const offerCandidates = [...offerResult.candidates];
  const kitDescription = nonEmpty(kit.description);
  if (kitDescription) {
    offerCandidates.push(kitDescription);
    const rowOfferValues = [
      ...rows.flatMap((row) => {
        const extracted = row.origin === "campaign"
          ? extractCampaignSlot(row, "offer")
          : extractCreativeWorkSlot(row, "offer");
        const values: string[] = [];
        if (extracted.fact) values.push(extracted.fact);
        if ("candidate" in extracted && extracted.candidate) values.push(extracted.candidate);
        return values;
      }),
    ];
    if (!offer && rowOfferValues.length === 0) {
      offer = kitDescription;
    }
  }

  let tone = toneResult.fact;
  if (!tone) {
    tone = nonEmpty(kit.toneOfVoice) ?? nonEmpty(kit.toneNotes);
  }

  return {
    protocol: protocolResult.protocol,
    offer,
    audience: audienceResult.fact,
    tone,
    protocolCandidates: protocolResult.protocolCandidates,
    offerCandidates: [...new Set(offerCandidates)],
    audienceCandidates: audienceResult.candidates,
    toneCandidates: toneResult.candidates,
    workCount: rows.length,
  };
}

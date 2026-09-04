export const ENTRY_PROTOCOLS = [
  "single",
  "variations",
  "format_adaptation",
  "restyle",
  "carousel",
] as const;
export type EntryProtocol = (typeof ENTRY_PROTOCOLS)[number];

export const ENTRY_SLOTS = ["protocol", "offer", "audience", "tone"] as const;
export type EntrySlot = (typeof ENTRY_SLOTS)[number];

export type EntryFacts = {
  protocol: EntryProtocol | null;
  offer: string | null;
  audience: string | null;
  tone: string | null;
};

export type EntryContext = EntryFacts & {
  protocolCandidates: EntryProtocol[];
  offerCandidates: string[];
  audienceCandidates: string[];
  toneCandidates: string[];
  workCount: number;
};

export type EntryChip = {
  slot: EntrySlot;
  options: string[];
};

export type EntryLocale = "pt-BR" | "en";

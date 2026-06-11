export type CampaignMemoryEntryType =
  | "approved_cta"
  | "rejected_output"
  | "text_rule"
  | "regeneration_feedback";

export interface CampaignMemoryEntry {
  type: CampaignMemoryEntryType;
  text: string;
  derivationId?: string;
  createdAt: string;
}

export interface CampaignMemoryRecord {
  schemaVersion: 1;
  entries: CampaignMemoryEntry[];
}

const MAX_ENTRIES = 24;

export function emptyCampaignMemory(): CampaignMemoryRecord {
  return { schemaVersion: 1, entries: [] };
}

export function normalizeCampaignMemory(
  value: CampaignMemoryRecord | null | undefined
): CampaignMemoryRecord {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    return emptyCampaignMemory();
  }
  return {
    schemaVersion: 1,
    entries: value.entries
      .filter((e) => typeof e.text === "string" && e.text.trim().length > 0)
      .slice(0, MAX_ENTRIES),
  };
}

export function appendCampaignMemoryEntry(
  current: CampaignMemoryRecord | null | undefined,
  entry: Omit<CampaignMemoryEntry, "createdAt"> & { createdAt?: string }
): CampaignMemoryRecord {
  const base = normalizeCampaignMemory(current);
  const text = entry.text.trim();
  if (!text) return base;

  const createdAt = entry.createdAt ?? new Date().toISOString();
  const next: CampaignMemoryEntry = { ...entry, text, createdAt };

  const withoutDup = base.entries.filter(
    (e) => !(e.type === next.type && e.text === next.text)
  );
  return {
    schemaVersion: 1,
    entries: [next, ...withoutDup].slice(0, MAX_ENTRIES),
  };
}

export function buildCampaignMemoryPromptBlock(
  memory: CampaignMemoryRecord | null | undefined
): string {
  const normalized = normalizeCampaignMemory(memory);
  if (normalized.entries.length === 0) return "";

  const lines = normalized.entries.slice(0, 8).map((entry) => {
    const label =
      entry.type === "approved_cta"
        ? "Approved CTA"
        : entry.type === "rejected_output"
          ? "Rejected pattern"
          : entry.type === "text_rule"
            ? "Text rule"
            : "Regeneration feedback";
    return `- [${label}] ${entry.text}`;
  });

  return [
    "CAMPAIGN MEMORY (learned within this campaign):",
    "These notes reflect prior approvals, rejections, and corrections in this campaign.",
    "They are auxiliary context only and must not override the literal CTA, source image, target format, or campaign constraints.",
    ...lines,
  ].join("\n");
}

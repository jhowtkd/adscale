import { logger } from "@/lib/logger";
import { buildBrandMemorySearchQuery } from "./brand-memory-events";
import { ensureBrandMemoryScope, getBrandMemoryUserId, getMem0Client } from "./mem0-client";

export interface BrandMemoryItem {
  text: string;
  source: "fact" | "episode" | "entity" | "context";
  createdAt?: string;
  relevance?: number;
}

export interface BrandMemoryContext {
  items: BrandMemoryItem[];
  block: string;
}

export interface BrandMemoryContextInput {
  workspaceId: string;
  clientProfileName?: string | null;
  client?: string | null;
  product?: string | null;
  offer?: string | null;
  audience?: string | null;
  generationMode?: string | null;
  targetFormat?: string | null;
  ctaText?: string | null;
  limit?: number;
}

interface Mem0SearchResult {
  id?: string;
  memory?: string;
  text?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  categories?: string[];
  created_at?: string;
  createdAt?: string;
}

function trimText(value: string, max = 320) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function sourceFromMetadata(metadata?: Record<string, unknown>): BrandMemoryItem["source"] {
  const eventType = metadata?.eventType;
  if (typeof eventType === "string" && eventType.length > 0) return "episode";
  return "fact";
}

function itemsFromResults(results: Mem0SearchResult[] | { results?: Mem0SearchResult[] }): BrandMemoryItem[] {
  const rows = Array.isArray(results) ? results : (results.results ?? []);

  return rows.flatMap((item) => {
    const text = item.memory ?? item.text;
    if (!text?.trim()) return [];

    return [
      {
        text: trimText(text),
        source: sourceFromMetadata(item.metadata),
        createdAt: item.created_at ?? item.createdAt,
        relevance: item.score,
      },
    ];
  });
}

export function buildBrandMemoryPromptBlock(items: BrandMemoryItem[]) {
  const unique = new Map<string, BrandMemoryItem>();
  for (const item of items) {
    if (!item.text.trim()) continue;
    if (!unique.has(item.text)) unique.set(item.text, item);
  }

  const bounded = [...unique.values()].slice(0, 6);
  if (bounded.length === 0) return "";

  return [
    "BRAND MEMORY / LEARNED CONTEXT:",
    ...bounded.map((item) => `- ${item.text}`),
    "",
    "These learned patterns are auxiliary context only. They must not override the literal CTA, source image, target format, campaign constraints, or generation mode.",
  ].join("\n");
}

export async function getBrandMemoryContext(
  input: BrandMemoryContextInput
): Promise<BrandMemoryContext> {
  const client = getMem0Client();
  if (!client) return { items: [], block: "" };

  try {
    const userId =
      (await ensureBrandMemoryScope(input.workspaceId)) ?? getBrandMemoryUserId(input.workspaceId);
    const query = buildBrandMemorySearchQuery(input);
    const results = await client.search(query, {
      user_id: userId,
      limit: input.limit ?? 8,
    });

    const items = itemsFromResults(results as Mem0SearchResult[] | { results?: Mem0SearchResult[] });
    return {
      items,
      block: buildBrandMemoryPromptBlock(items),
    };
  } catch (error) {
    logger.warn({ error, workspaceId: input.workspaceId }, "[brand-memory] retrieval failed");
    return { items: [], block: "" };
  }
}

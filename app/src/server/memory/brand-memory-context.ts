import type { Zep } from "@getzep/zep-cloud";
import { logger } from "@/lib/logger";
import { buildBrandMemorySearchQuery } from "./brand-memory-events";
import { ensureBrandMemoryGraph, getBrandMemoryGraphId, getZepClient } from "./zep-client";

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

function trimText(value: string, max = 320) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function itemFromContext(context: string | undefined): BrandMemoryItem[] {
  if (!context?.trim()) return [];
  return [
    {
      text: trimText(context, 900),
      source: "context",
    },
  ];
}

function itemsFromResults(results: Zep.GraphSearchResults): BrandMemoryItem[] {
  const edges =
    results.edges?.map((edge) => ({
      text: trimText(edge.fact),
      source: "fact" as const,
      createdAt: edge.validAt ?? edge.createdAt,
      relevance: edge.relevance ?? edge.score,
    })) ?? [];

  const episodes =
    results.episodes?.map((episode) => ({
      text: trimText(episode.content),
      source: "episode" as const,
      createdAt: episode.createdAt,
      relevance: episode.relevance ?? episode.score,
    })) ?? [];

  const nodes =
    results.nodes?.map((node) => ({
      text: trimText(`${node.name}: ${node.summary}`),
      source: "entity" as const,
      createdAt: node.createdAt,
      relevance: node.relevance ?? node.score,
    })) ?? [];

  return [...edges, ...episodes, ...nodes, ...itemFromContext(results.context)];
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
  const client = getZepClient();
  if (!client) return { items: [], block: "" };

  try {
    const graphId = (await ensureBrandMemoryGraph(input.workspaceId)) ?? getBrandMemoryGraphId(input.workspaceId);
    const query = buildBrandMemorySearchQuery(input);
    const results = await client.graph.search(
      {
        graphId,
        query,
        scope: "auto",
        returnRawResults: true,
        limit: input.limit ?? 8,
        maxCharacters: 2500,
      },
      { timeoutInSeconds: 10, maxRetries: 1 }
    );

    const items = itemsFromResults(results);
    return {
      items,
      block: buildBrandMemoryPromptBlock(items),
    };
  } catch (error) {
    logger.warn({ error, workspaceId: input.workspaceId }, "[brand-memory] retrieval failed");
    return { items: [], block: "" };
  }
}


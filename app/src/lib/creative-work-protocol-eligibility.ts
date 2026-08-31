export type CreativeWorkEligibleIntent = "single" | "variations" | "format_adaptation" | "restyle";

export function hasCreativeWorkProtocolSourceShape(input: {
  intent: CreativeWorkEligibleIntent;
  request: string;
  sources: readonly { sourceId: string; usage: "content" | "style" | "both" }[];
}) {
  const { intent, request, sources } = input;
  if (intent === "single") return request.trim().length > 0 && sources.length <= 3;
  if (intent === "variations") return sources.length > 0;
  if (intent === "format_adaptation") return sources.length === 1;
  return sources.length === 2
    && new Set(sources.map((source) => source.sourceId)).size === 2
    && sources.some((source) => source.usage === "content")
    && sources.some((source) => source.usage === "style")
    && !sources.some((source) => source.usage === "both");
}

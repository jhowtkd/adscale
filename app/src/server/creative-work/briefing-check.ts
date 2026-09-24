import type { CreativeWorkFactPack, InferredBriefing } from "./contracts";

export type BriefingCheckFinding = {
  code: "missing_direction" | "unsupported_offer";
  recoverable: boolean;
};

export type BriefingCheck = {
  ok: boolean;
  findings: BriefingCheckFinding[];
};

function normalize(value: string): string {
  return value.toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

export function hasFactOrigin(value: string, factPack: CreativeWorkFactPack): boolean {
  const needle = normalize(value);
  if (!needle) return false;
  return normalize(factPack.request).includes(needle)
    || factPack.facts.some((fact) => normalize(fact.value) === needle);
}

/** Validate the durable envelope without consulting history or a new source. */
export function checkInferredBriefing(
  briefing: InferredBriefing,
  factPack: CreativeWorkFactPack,
): BriefingCheck {
  const findings: BriefingCheckFinding[] = [];
  if (!briefing.message.value?.trim() || !briefing.objective.value?.trim()) {
    findings.push({ code: "missing_direction", recoverable: true });
  }
  if (
    briefing.offer.state !== "unknown"
    && briefing.offer.value
    && !hasFactOrigin(briefing.offer.value, factPack)
  ) {
    findings.push({ code: "unsupported_offer", recoverable: true });
  }
  return { ok: findings.length === 0, findings };
}

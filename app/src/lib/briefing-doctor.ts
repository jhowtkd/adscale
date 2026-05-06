export type BriefingDoctorSeverity = "low" | "medium" | "high";
export type BriefingDoctorReadiness = "ready" | "needs_attention" | "weak";

export interface BriefingDoctorInput {
  name: string;
  client: string;
  objective: string;
  audience: string;
  platforms: string[];
  tone: string;
  offer: string;
  constraints: string;
  notes: string;
  generationMode: "art_variation" | "format_adaptation";
  creativeLevel: "conservative" | "balanced" | "bold";
  targetFormat?: string;
  ctaVariants: [string, string, string] | string[];
}

export interface BriefingDoctorIssue {
  field: keyof BriefingDoctorInput;
  severity: BriefingDoctorSeverity;
  message: string;
  impact: string;
}

export interface BriefingFieldPatch {
  field: keyof BriefingDoctorInput;
  value: string | string[];
}

export interface BriefingLocalAnalysis {
  readiness: BriefingDoctorReadiness;
  issues: BriefingDoctorIssue[];
}

const genericAudiences = new Set(["todos", "todo mundo", "everyone", "all", "geral", "público geral", "publico geral"]);
const genericCtas = new Set(["clique aqui", "click here", "saiba mais", "learn more", "ver mais"]);
const validFormats = new Set(["1:1", "4:5", "9:16"]);

function isBlank(value?: string | null) {
  return !value || value.trim().length === 0;
}

function hasOfferSignal(value: string) {
  return /\d|%|off|desconto|até|ate|hoje|domingo|prazo|grátis|gratis|frete|benef[ií]cio|econom/i.test(value);
}

function computeReadiness(issues: BriefingDoctorIssue[]): BriefingDoctorReadiness {
  if (issues.some((issue) => issue.severity === "high")) return "weak";
  if (issues.length > 0) return "needs_attention";
  return "ready";
}

export function analyzeBriefingLocal(input: BriefingDoctorInput): BriefingLocalAnalysis {
  const issues: BriefingDoctorIssue[] = [];

  if (isBlank(input.objective)) {
    issues.push({
      field: "objective",
      severity: "high",
      message: "Objective is missing.",
      impact: "The generated creative may not know what action or outcome to optimize for.",
    });
  }

  const audience = input.audience.trim().toLowerCase();
  if (isBlank(input.audience)) {
    issues.push({
      field: "audience",
      severity: "high",
      message: "Audience is missing.",
      impact: "The model may produce generic copy and visuals.",
    });
  } else if (genericAudiences.has(audience) || audience.length < 8) {
    issues.push({
      field: "audience",
      severity: "medium",
      message: "Audience is too broad.",
      impact: "More specific audiences usually produce sharper hooks and visuals.",
    });
  }

  if (isBlank(input.offer)) {
    issues.push({
      field: "offer",
      severity: "medium",
      message: "Offer is missing.",
      impact: "The ad may lack a concrete reason to click.",
    });
  } else if (!hasOfferSignal(input.offer)) {
    issues.push({
      field: "offer",
      severity: "low",
      message: "Offer could be more specific.",
      impact: "Numbers, deadlines, or benefits make the creative easier to understand.",
    });
  }

  const ctas = input.ctaVariants.map((cta) => cta.trim()).filter(Boolean);
  if (input.generationMode === "art_variation" && ctas.length === 0) {
    issues.push({
      field: "ctaVariants",
      severity: "high",
      message: "At least one CTA is missing.",
      impact: "Generated pieces need a clear action to preserve campaign intent.",
    });
  }

  for (const cta of ctas) {
    const normalized = cta.toLowerCase();
    if (genericCtas.has(normalized)) {
      issues.push({
        field: "ctaVariants",
        severity: "medium",
        message: "CTA is generic.",
        impact: "A more specific CTA can better match the offer and campaign goal.",
      });
      break;
    }
    if (cta.length > 34) {
      issues.push({
        field: "ctaVariants",
        severity: "low",
        message: "CTA may be too long.",
        impact: "Long CTAs can become hard to render legibly in generated ads.",
      });
      break;
    }
  }

  if (input.generationMode === "format_adaptation") {
    if (isBlank(input.targetFormat) || !validFormats.has(input.targetFormat ?? "")) {
      issues.push({
        field: "targetFormat",
        severity: "high",
        message: "Target format is missing.",
        impact: "Format adaptation needs one exact output ratio.",
      });
    }
  }

  return {
    readiness: computeReadiness(issues),
    issues,
  };
}

export function applyBriefingFieldPatch(
  current: BriefingDoctorInput,
  patch: BriefingFieldPatch
): BriefingDoctorInput {
  if (patch.field === "targetFormat") {
    const value = Array.isArray(patch.value) ? patch.value[0] : patch.value;
    if (!validFormats.has(value)) return current;
    return { ...current, targetFormat: value };
  }

  if (patch.field === "ctaVariants") {
    const incoming = Array.isArray(patch.value) ? patch.value : [patch.value];
    const next = [...current.ctaVariants] as [string, string, string];
    for (const suggestion of incoming) {
      const emptyIndex = next.findIndex((cta) => cta.trim().length === 0);
      if (emptyIndex === -1) break;
      next[emptyIndex] = suggestion;
    }
    return { ...current, ctaVariants: next };
  }

  if (Array.isArray(patch.value)) return current;
  return { ...current, [patch.field]: patch.value };
}

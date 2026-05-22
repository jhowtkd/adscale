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
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel: "conservative" | "balanced" | "bold" | "extreme";
  targetFormat?: string;
  ctaVariants: [string, string, string] | string[];
}

export interface BriefingDoctorIssue {
  field: keyof BriefingDoctorInput;
  severity: BriefingDoctorSeverity;
  messageKey: string;
  impactKey: string;
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
const validFormats = new Set(["1:1", "4:5", "9:16", "1.91:1", "16:9"]);

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
      messageKey: "doctor.issues.objectiveMissing.message",
      impactKey: "doctor.issues.objectiveMissing.impact",
    });
  }

  const audience = input.audience.trim().toLowerCase();
  if (isBlank(input.audience)) {
    issues.push({
      field: "audience",
      severity: "high",
      messageKey: "doctor.issues.audienceMissing.message",
      impactKey: "doctor.issues.audienceMissing.impact",
    });
  } else if (genericAudiences.has(audience) || audience.length < 8) {
    issues.push({
      field: "audience",
      severity: "medium",
      messageKey: "doctor.issues.audienceBroad.message",
      impactKey: "doctor.issues.audienceBroad.impact",
    });
  }

  if (isBlank(input.offer)) {
    issues.push({
      field: "offer",
      severity: "medium",
      messageKey: "doctor.issues.offerMissing.message",
      impactKey: "doctor.issues.offerMissing.impact",
    });
  } else if (!hasOfferSignal(input.offer)) {
    issues.push({
      field: "offer",
      severity: "low",
      messageKey: "doctor.issues.offerWeak.message",
      impactKey: "doctor.issues.offerWeak.impact",
    });
  }

  const ctas = input.ctaVariants.map((cta) => cta.trim()).filter(Boolean);
  if (input.generationMode === "art_variation" && ctas.length === 0) {
    issues.push({
      field: "ctaVariants",
      severity: "high",
      messageKey: "doctor.issues.ctaMissing.message",
      impactKey: "doctor.issues.ctaMissing.impact",
    });
  }

  for (const cta of ctas) {
    const normalized = cta.toLowerCase();
    if (genericCtas.has(normalized)) {
      issues.push({
        field: "ctaVariants",
        severity: "medium",
        messageKey: "doctor.issues.ctaGeneric.message",
        impactKey: "doctor.issues.ctaGeneric.impact",
      });
      break;
    }
    if (cta.length > 34) {
      issues.push({
        field: "ctaVariants",
        severity: "low",
        messageKey: "doctor.issues.ctaLong.message",
        impactKey: "doctor.issues.ctaLong.impact",
      });
      break;
    }
  }

  if (input.generationMode === "format_adaptation") {
    if (isBlank(input.targetFormat) || !validFormats.has(input.targetFormat ?? "")) {
      issues.push({
        field: "targetFormat",
        severity: "high",
        messageKey: "doctor.issues.targetFormatMissing.message",
        impactKey: "doctor.issues.targetFormatMissing.impact",
      });
    }

    const hasVerticalPlatform = input.platforms.some((p) => p === "TikTok");
    if (hasVerticalPlatform && input.targetFormat === "1:1") {
      issues.push({
        field: "platforms",
        severity: "medium",
        messageKey: "doctor.issues.platformFormatMismatch.message",
        impactKey: "doctor.issues.platformFormatMismatch.impact",
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

import type { CreativeContract } from "../creative-contract";
import { resolveCanonicalCreative } from "../canonical-creative-contract";
import type { BaseCreativeReading } from "./base-reading";
import { OLHAR_ADSCALE_PRINCIPLES } from "./constitution";
import { buildClientVoicePromptSection } from "../voices/client-voice";
import { resolveVoiceForClientProfile } from "../voices/voice-config-resolver";
import { isClientVoiceInjectionAllowed } from "../voices/voice-review-gate";

export const GENERATION_DIRECTION_HEADER = "DIRECAO DE ARTE PARA GERACAO";

export interface GenerationDirectionInput {
  contract: CreativeContract;
  campaign?: {
    name?: string | null;
    client?: string | null;
    product?: string | null;
    objective?: string | null;
    constraints?: string | null;
    offer?: string | null;
  } | null;
  generationMode: "art_variation" | "format_adaptation" | "restyling";
  creativeLevel?: string | null;
  targetFormat?: string;
  baseReading?: BaseCreativeReading | null;
  locale?: string;
  workspaceId?: string;
  clientProfileId?: string | null;
  /** Operator/test override — still requires a matching client voice resolver. */
  allowClientVoice?: boolean;
}

const GLOBAL_ANTI_PATTERNS = [
  "Generic AI template aesthetics (neon glow, glassmorphism, widget-dashboard stacks) without source reason.",
  "Decorative-only variation without a new composition mechanism or reading-path anchor.",
  "Competing information groups at equal visual weight — max three reading-path anchors.",
  "CTA as fake app-download chrome when the source uses editorial invite text.",
  "Letting export checklist language override figure, gestalt, voice, or invite in this generation pass.",
] as const;

function resolveCtaLabel(contract: CreativeContract): string {
  if (contract.ctaSemantics.kind === "explicit") {
    return contract.ctaSemantics.text;
  }
  if (contract.ctaSemantics.kind === "inherited") {
    return "inherit from reference";
  }
  return "as briefed";
}

function buildSacredFactsLines(
  contract: CreativeContract,
  campaign?: GenerationDirectionInput["campaign"]
): string[] {
  const canonical =
    contract.canonicalCreative ?? resolveCanonicalCreative(contract, campaign);

  const lines = [
    `Dominant idea: ${canonical.dominantIdea}`,
    `Hook / offer: ${canonical.hook}; proof zone: ${canonical.proofZone}`,
    `CTA contract: ${resolveCtaLabel(contract)}`,
    `Target format: ${contract.targetFormat}`,
    `Mandatory tiers: ${canonical.tiers.mandatory.join("; ")}`,
  ];

  const client = contract.client?.trim() || campaign?.client?.trim();
  const product = contract.product?.trim() || campaign?.product?.trim();
  const offer = contract.offer?.trim() || campaign?.offer?.trim();
  const constraints =
    contract.constraints?.trim() || campaign?.constraints?.trim();

  if (client) lines.push(`Client / brand: ${client}`);
  if (product) lines.push(`Product / service: ${product}`);
  if (offer) lines.push(`Offer: ${offer}`);
  if (constraints) lines.push(`Export constraints: ${constraints}`);

  return lines;
}

function buildVariationRangeLines(
  mode: GenerationDirectionInput["generationMode"],
  creativeLevel?: string | null
): string[] {
  if (mode === "format_adaptation") {
    return [
      "Native layout rebuild for the target format — same campaign, same copy, new frame.",
      "Composition, scale, grouping, and safe margins may change; narrative and offer may not.",
    ];
  }

  if (mode === "restyling") {
    return [
      "Visual language only: color, typography rhythm, composition mood from the style reference.",
      "Factual content locked to the base image — no claims, brands, or CTA from the style reference.",
    ];
  }

  const level = creativeLevel ?? "balanced";
  const guides: Record<string, string> = {
    conservative:
      "Minimal structural change — same visual universe; layout and disposition tweaks only.",
    balanced:
      "Sibling creative — noticeably new composition while keeping brand identity recognizable.",
    bold:
      "Dramatic background and hierarchy shift while preserving core brand assets and mandatory copy.",
    extreme:
      "Fresh environment and reading while preserving product, offer, CTA, and brand constraints.",
  };

  return [
    `Creative level: ${level}`,
    guides[level] ?? guides.balanced,
    "Respect the Olhar gestalt budget — max three reading-path anchors (hook, proof, invite).",
  ];
}

function buildGestaltLines(input: GenerationDirectionInput): string[] {
  const reading = input.baseReading;
  if (reading) {
    return [
      `Dominant idea to preserve: ${reading.dominantIdea}`,
      `Gestalt: ${reading.gestaltRead}`,
      `Thumbnail read: ${reading.thumbnailRead}`,
      `Invite weight: ${reading.inviteWeight}; brand presence: ${reading.brandPresence}`,
      ...(reading.risks.length > 0
        ? [`Pre-generation risks to avoid: ${reading.risks.join("; ")}`]
        : []),
    ];
  }

  const canonical =
    input.contract.canonicalCreative ??
    resolveCanonicalCreative(input.contract, input.campaign);

  return [
    `Dominant idea to preserve: ${canonical.dominantIdea}`,
    "Gestalt: preserve figure-ground rhythm and intentional silence between hook, proof, and invite.",
    "Thumbnail read: one focal figure must survive at feed-preview scale.",
  ];
}

function buildOlharAntiPatternLines(): string[] {
  const axisGuards = OLHAR_ADSCALE_PRINCIPLES.map(
    (principle) => `- ${principle.title}: ${principle.summary}`
  );

  return [
    "Global Olhar anti-patterns (reject in this generation pass):",
    ...GLOBAL_ANTI_PATTERNS.map((pattern) => `- ${pattern}`),
    "",
    "Olhar axis guards:",
    ...axisGuards,
    "",
    "Exportacao reminder: brand, CTA, claims, format, required text, and resolution are validated in a second pass after generation.",
  ];
}

export async function buildGenerationDirectionSection(
  input: GenerationDirectionInput
): Promise<string[]> {
  const lines: string[] = [
    "",
    `${GENERATION_DIRECTION_HEADER}:`,
    "- Art-direction intent for this generation pass. Flexible strategy below must not override sacred facts or hard rules.",
    "",
    "## Figure and gestalt",
    ...buildGestaltLines(input).map((line) => `- ${line}`),
    "",
    "## Sacred facts",
    ...buildSacredFactsLines(input.contract, input.campaign).map(
      (line) => `- ${line}`
    ),
    "",
    "## Allowed variation",
    ...buildVariationRangeLines(
      input.generationMode,
      input.creativeLevel
    ).map((line) => `- ${line}`),
    "",
    ...buildOlharAntiPatternLines(),
  ];

  const workspaceId = input.workspaceId;
  const clientProfileId = input.clientProfileId;

  if (workspaceId && clientProfileId) {
    const resolved = await resolveVoiceForClientProfile({
      workspaceId,
      clientProfileId,
    });

    if (
      resolved &&
      isClientVoiceInjectionAllowed(resolved.voice.id, {
        clientProfileId,
        workspaceId,
        reviewStatus: resolved.reviewStatus,
        forceApproved: input.allowClientVoice,
      })
    ) {
      lines.push("", ...buildClientVoicePromptSection(resolved.voice));
    }
  }

  return lines;
}

export function extractPromptGenerationDirectionSection(prompt: string): string {
  const start = prompt.indexOf(GENERATION_DIRECTION_HEADER);
  if (start === -1) {
    return "";
  }

  const endMarkers = [
    "\nMODE:",
    "\nRESTYLING FACTUAL-SOURCE RULE:",
    "\nVISUAL REFERENCE TRANSFER RULE:",
    "\nCREATIVITY LEVEL:",
    "\nAPPROVED CREATIVE DIAGNOSIS:",
    "\nBRIEF-BASED PRESERVATION FALLBACK:",
    "\n\nCampaign:",
  ];

  let end = prompt.length;
  for (const marker of endMarkers) {
    const idx = prompt.indexOf(marker, start + GENERATION_DIRECTION_HEADER.length);
    if (idx !== -1 && idx < end) {
      end = idx;
    }
  }

  return prompt.slice(start, end).trimEnd();
}

export interface Campaign {
  id: string;
  workspaceId: string;
  name: string;
  client: string | null;
  product: string | null;
  objective: string | null;
  audience: string | null;
  platforms: string[] | null;
  tone: string | null;
  offer: string | null;
  constraints: string | null;
  notes: string | null;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Asset {
  id: string;
  campaignId: string;
  workspaceId: string;
  key: string;
  type: string;
  size: number | null;
  width: number | null;
  height: number | null;
  createdAt: Date | string;
}

export interface Plan {
  id: string;
  strategy: string | null;
  angles: string[] | null;
  hooks: string[] | null;
  ctas: string[] | null;
}

function languageInstruction(locale?: string): string {
  if (locale === "pt-BR") {
    return "\n\nIMPORTANT: Respond entirely in Brazilian Portuguese (pt-BR). All strategy, angles, hooks, and CTAs must be written in Portuguese.";
  }
  return "";
}

function imageLanguageInstruction(locale?: string): string {
  if (locale === "pt-BR") {
    return "\n\nIMPORTANT: The advertisement concept, copy, and visual direction must be designed for a Brazilian Portuguese-speaking audience. Any text overlays or copy suggestions should be in Brazilian Portuguese (pt-BR).";
  }
  return "";
}

export function buildPlanPrompt(campaign: Campaign, asset?: Asset, locale?: string) {
  return `You are a creative strategist. Based on this campaign brief, generate a creative plan.

Campaign: ${campaign.name}
Client/Product: ${campaign.client || campaign.product || "N/A"}
Objective: ${campaign.objective || "N/A"}
Target Audience: ${campaign.audience || "N/A"}
Platforms: ${campaign.platforms?.join(", ") || "N/A"}
Tone: ${campaign.tone || "N/A"}
Offer: ${campaign.offer || "N/A"}
Constraints: ${campaign.constraints || "None"}
Notes: ${campaign.notes || "None"}
${asset ? `Reference Asset: ${asset.key} (${asset.type})` : ""}

Return ONLY a JSON object with this exact structure:
{
  "strategy": "string",
  "angles": ["string"],
  "hooks": ["string"],
  "ctas": ["string"]
}${languageInstruction(locale)}`;
}

export function buildDerivationPrompt(
  plan: Plan | null,
  asset: Asset | undefined,
  feedback?: string | null,
  locale?: string
) {
  const parts: string[] = [
    "You are a world-class creative director and image generation specialist. Create a single high-quality advertising image based on the following creative brief.",
  ];

  if (plan) {
    parts.push(`\nCreative Strategy: ${plan.strategy}`);
    if (plan.angles && plan.angles.length > 0) {
      parts.push(`\nCreative Angles:\n${plan.angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}`);
    }
    if (plan.hooks && plan.hooks.length > 0) {
      parts.push(`\nHook Copy Options:\n${plan.hooks.map((h) => `- ${h}`).join("\n")}`);
    }
    if (plan.ctas && plan.ctas.length > 0) {
      parts.push(`\nCTA Recommendations:\n${plan.ctas.map((c) => `- ${c}`).join("\n")}`);
    }
  }

  if (asset) {
    parts.push(`\nReference Asset Key: ${asset.key} (${asset.type})`);
    parts.push("Incorporate the visual style and subject matter from the reference asset.");
  }

  if (feedback && feedback.trim().length > 0) {
    parts.push(`\nRevision Feedback: ${feedback}`);
  }

  parts.push(
    "\nGenerate a polished, professional advertisement image suitable for social media platforms."
  );

  parts.push(imageLanguageInstruction(locale));

  return parts.join("\n");
}

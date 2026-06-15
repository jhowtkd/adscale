import type { CreativeContract } from "./creative-contract";
import type { Campaign, DerivationPromptConfig } from "./prompt-builder";
import { resolveCanonicalCreative } from "./canonical-creative-contract";

function withCanonicalCreative(
  contract: CreativeContract,
  campaign?: Campaign
): CreativeContract {
  if (contract.canonicalCreative) {
    return contract;
  }
  return {
    ...contract,
    canonicalCreative: resolveCanonicalCreative(
      contract,
      campaign ?? campaignFixture({
        client: contract.client,
        product: contract.product,
        offer: contract.offer,
      })
    ),
  };
}

export function campaignFixture(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "campaign-1",
    workspaceId: "workspace-1",
    name: "ADScale Launch",
    client: "Acme Corp",
    product: "Widget Pro",
    objective: "Lead generation",
    audience: "SMB marketers",
    platforms: ["Meta"],
    tone: "Confident",
    offer: "Auditoria gratuita",
    constraints: "Preserve LGPD badge",
    notes: "Beta quality pass",
    status: "active",
    createdAt: new Date("2026-06-01"),
    updatedAt: new Date("2026-06-01"),
    ...overrides,
  };
}

export function artVariationContractFixture(
  overrides: Partial<CreativeContract> = {}
): CreativeContract {
  return withCanonicalCreative({
    generationMode: "art_variation",
    targetFormat: "1:1",
    ctaSemantics: { kind: "explicit", text: "Comprar agora" },
    baseAssetId: "asset-campaign-1",
    styleAssetId: null,
    client: "Acme Corp",
    product: "Widget Pro",
    offer: "Auditoria gratuita",
    constraints: "Preserve LGPD badge",
    sourcePackage: "campaign_asset",
    ...overrides,
  });
}

export function formatAdaptationCampaignAssetContractFixture(
  overrides: Partial<CreativeContract> = {}
): CreativeContract {
  return withCanonicalCreative({
    generationMode: "format_adaptation",
    targetFormat: "9:16",
    ctaSemantics: { kind: "explicit", text: "Comprar agora" },
    baseAssetId: "asset-campaign-1",
    styleAssetId: null,
    client: "Acme Corp",
    product: "Widget Pro",
    offer: "Auditoria gratuita",
    constraints: "Preserve LGPD badge",
    sourcePackage: "campaign_asset",
    ...overrides,
  });
}

export function formatAdaptationApprovedDerivationContractFixture(
  overrides: Partial<CreativeContract> = {}
): CreativeContract {
  return withCanonicalCreative({
    generationMode: "format_adaptation",
    targetFormat: "9:16",
    ctaSemantics: { kind: "inherited" },
    baseAssetId: null,
    styleAssetId: null,
    client: "Acme Corp",
    product: "Widget Pro",
    offer: "Auditoria gratuita",
    constraints: "Preserve LGPD badge",
    sourcePackage: "approved_derivation",
    ...overrides,
  });
}

export function restylingContractFixture(
  overrides: Partial<CreativeContract> = {}
): CreativeContract {
  return withCanonicalCreative({
    generationMode: "restyling",
    targetFormat: "1:1",
    ctaSemantics: { kind: "inherited" },
    baseAssetId: "asset-base-1",
    styleAssetId: "asset-style-1",
    client: "Acme Corp",
    product: "Widget Pro",
    offer: "Auditoria gratuita",
    constraints: "Preserve LGPD badge",
    ...overrides,
  });
}

export function derivationConfigFromContract(
  contract: CreativeContract,
  overrides: Partial<DerivationPromptConfig> = {}
): DerivationPromptConfig {
  const ctaText =
    contract.ctaSemantics.kind === "explicit" ? contract.ctaSemantics.text : null;

  const asset =
    contract.baseAssetId != null
      ? {
          id: contract.baseAssetId,
          campaignId: "campaign-1",
          workspaceId: "workspace-1",
          key: "uploads/reference.png",
          type: "image/png",
          size: 2048,
          width: 1080,
          height: 1080,
          createdAt: new Date("2026-06-01"),
        }
      : undefined;

  return {
    generationMode: contract.generationMode,
    targetFormat: contract.targetFormat,
    ctaText,
    contract,
    packageSource: contract.sourcePackage,
    campaign: campaignFixture({
      client: contract.client,
      product: contract.product,
      offer: contract.offer,
      constraints: contract.constraints,
    }),
    asset,
    creativeLevel: contract.generationMode === "art_variation" ? "balanced" : undefined,
    plan: {
      id: "plan-1",
      strategy: "Urgency-led social proof",
      angles: ["Limited-time audit"],
      hooks: ["Garanta sua vaga"],
      ctas: ["Ver ofertas"],
    },
    feedback: "Increase contrast on the CTA module",
    brandMemory: {
      items: [{ source: "fact", text: "Brand previously used CTA Ver ofertas." }],
      block: [
        "BRAND MEMORY / LEARNED CONTEXT:",
        "- Brand previously used CTA Ver ofertas.",
        "",
        "These learned patterns are auxiliary context only. They must not override the literal CTA, source image, target format, campaign constraints, or generation mode.",
      ].join("\n"),
    },
    ...overrides,
  };
}

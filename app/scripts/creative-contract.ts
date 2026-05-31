import { ContentBrief, StyleBrief } from "@/server/ai/image-analysis";

export interface CreativeContract {
  adId: string;
  campaignId: string;
  clientName: string;
  productName: string;
  offer: string;
  ctaVariants: string[]; // CTA(s) permitido(s) literalmente
  requiredElements: string[]; // elementos que NÃO podem ser removidos
  optionalElements: string[]; // elementos que PODEM ser alterados
  legalTerms: string[]; // termos legais obrigatórios
  brandColors?: string[];
  logoRequired: boolean;
  targetFormats: string[];
  creativeTolerance: "strict" | "moderate" | "loose";
  // Método para validar um output contra este contrato
  validateOutput(
    outputAnalysis: {
      detectedCta?: string;
      detectedOffer?: string;
      detectedProduct?: string;
      hasLogo?: boolean;
      hasLegalTerms?: boolean;
      dimensions: { width: number; height: number };
    },
    expectedFormat?: string
  ): {
    passed: boolean;
    failures: string[];
    warnings: string[];
  };
}

export interface ValidationResult {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

export function extractContractFromAd(
  meta: {
    fileName: string;
    width?: number;
    height?: number;
  },
  analyzeImageContentResult: ContentBrief,
  analyzeImageStyleResult?: StyleBrief
): CreativeContract {
  const content = analyzeImageContentResult;

  // Build required elements from detected content
  const requiredElements: string[] = [];
  if (content.cta?.text) requiredElements.push(`CTA: "${content.cta.text}"`);
  if (content.offer) requiredElements.push(`Offer: "${content.offer}"`);
  if (content.product) requiredElements.push(`Product: "${content.product}"`);

  // Detect legal terms from text content and offer text
  const legalTerms: string[] = [];
  const allText = [
    content.offer,
    content.textContent?.headline,
    ...(content.textContent?.bullets ?? []),
  ]
    .filter((t): t is string => typeof t === "string")
    .join(" ");

  const legalPatterns = [
    /\b(?:termos?|condi[çc][õo]es?)\b/gi,
    /\b(?:regulamento|regras?)\b/gi,
    /\b(?:v[áa]lido|vig[êe]ncia|per[íi]odo)\b/gi,
    /\b(?:sujeito a|consulte|confira)\b/gi,
    /\b(?:at[ée] \d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/gi,
    /\b(?:promo[cç][ãa]o v[áa]lida)\b/gi,
    /\b(?:desconto de at[ée])\b/gi,
  ];

  for (const pattern of legalPatterns) {
    const matches = allText.match(pattern);
    if (matches) legalTerms.push(...matches);
  }

  // Deduplicate legal terms
  const uniqueLegalTerms = [...new Set(legalTerms.map((t) => t.toLowerCase()))];

  // Determine if logo is required from brand elements
  const logoRequired = content.brandElements?.some((el) =>
    /logo|marca|brand/i.test(el)
  ) ?? false;

  // Build brand colors from style analysis if available
  const brandColors: string[] = [];
  if (analyzeImageStyleResult?.colorPalette?.dominant) {
    brandColors.push(...analyzeImageStyleResult.colorPalette.dominant);
  }
  if (analyzeImageStyleResult?.colorPalette?.accents) {
    brandColors.push(...analyzeImageStyleResult.colorPalette.accents);
  }

  // Derive target format from detected format or dimensions
  const targetFormats: string[] = [];
  if (content.format) {
    targetFormats.push(content.format);
  } else if (meta.width && meta.height) {
    const ratio = meta.width / meta.height;
    if (Math.abs(ratio - 1) < 0.05) targetFormats.push("1:1");
    else if (Math.abs(ratio - 4 / 5) < 0.05) targetFormats.push("4:5");
    else if (Math.abs(ratio - 9 / 16) < 0.05) targetFormats.push("9:16");
    else if (Math.abs(ratio - 16 / 9) < 0.05) targetFormats.push("16:9");
    else targetFormats.push(`${meta.width}x${meta.height}`);
  }

  // Optional elements are everything else detected that isn't required
  const optionalElements: string[] = [];
  if (content.keyVisual) optionalElements.push(`Key visual: ${content.keyVisual}`);
  if (content.textContent?.headline) optionalElements.push(`Headline`);
  if (content.textContent?.bullets?.length) optionalElements.push(`Bullet points`);

  const contract: CreativeContract = {
    adId: meta.fileName,
    campaignId: `campaign-${meta.fileName}`,
    clientName: content.brandElements?.find((b) => /logo|marca|brand/i.test(b)) ?? "Unknown Client",
    productName: content.product ?? "Unknown Product",
    offer: content.offer ?? "Unknown Offer",
    ctaVariants: content.cta?.text ? [content.cta.text] : [],
    requiredElements,
    optionalElements,
    legalTerms: uniqueLegalTerms,
    brandColors: brandColors.length > 0 ? [...new Set(brandColors)] : undefined,
    logoRequired,
    targetFormats,
    creativeTolerance: "moderate",
    validateOutput(outputAnalysis, expectedFormat) {
      const failures: string[] = [];
      const warnings: string[] = [];

      // Validate CTA
      if (outputAnalysis.detectedCta !== undefined) {
        const ctaMatched = this.ctaVariants.some(
          (v) => v.toLowerCase().trim() === outputAnalysis.detectedCta?.toLowerCase().trim()
        );
        if (!ctaMatched) {
          failures.push(
            `CTA mismatch: expected one of [${this.ctaVariants.join(", ")}], got "${outputAnalysis.detectedCta}"`
          );
        }
      }

      // Validate offer presence
      if (outputAnalysis.detectedOffer !== undefined) {
        if (!outputAnalysis.detectedOffer || outputAnalysis.detectedOffer.trim().length === 0) {
          failures.push(`Offer missing: expected "${this.offer}"`);
        } else if (
          !this.offer.toLowerCase().includes(outputAnalysis.detectedOffer.toLowerCase()) &&
          !outputAnalysis.detectedOffer.toLowerCase().includes(this.offer.toLowerCase())
        ) {
          warnings.push(
            `Offer may differ: expected "${this.offer}", got "${outputAnalysis.detectedOffer}"`
          );
        }
      }

      // Validate product presence
      if (outputAnalysis.detectedProduct !== undefined) {
        if (!outputAnalysis.detectedProduct || outputAnalysis.detectedProduct.trim().length === 0) {
          failures.push(`Product missing: expected "${this.productName}"`);
        }
      }

      // Validate logo
      if (this.logoRequired && outputAnalysis.hasLogo === false) {
        failures.push("Logo missing: brand logo is required");
      }

      // Validate legal terms
      if (this.legalTerms.length > 0 && outputAnalysis.hasLegalTerms === false) {
        warnings.push("Legal terms may be missing");
      }

      // Validate dimensions against target formats
      const formatsToCheck = expectedFormat ? [expectedFormat] : this.targetFormats;
      if (formatsToCheck.length > 0 && outputAnalysis.dimensions) {
        const { width, height } = outputAnalysis.dimensions;
        const outputRatio = width / height;
        const formatMatch = formatsToCheck.some((fmt) => {
          if (fmt.includes("x") && !fmt.includes(":")) {
            // Exact pixel dimensions (e.g., "1024x1024")
            const [w, h] = fmt.split("x").map(Number);
            return w === width && h === height;
          }
          // Aspect ratio formats (e.g., "1:1", "4:5", "9:16")
          const [fw, fh] = fmt.split(":").map(Number);
          if (fw && fh) {
            const expectedRatio = fw / fh;
            return Math.abs(outputRatio - expectedRatio) < 0.05;
          }
          return false;
        });
        if (!formatMatch) {
          // Format mismatch is a failure for outputs (not just a warning)
          failures.push(
            `Format mismatch: dimensions ${width}x${height} do not match expected formats [${formatsToCheck.join(", ")}]`
          );
        }
      }

      return {
        passed: failures.length === 0,
        failures,
        warnings,
      };
    },
  };

  return contract;
}

export function validateCreativeOutput(
  contract: CreativeContract,
  _outputPath: string,
  analysisResult: {
    detectedCta?: string;
    detectedOffer?: string;
    detectedProduct?: string;
    hasLogo?: boolean;
    hasLegalTerms?: boolean;
    dimensions: { width: number; height: number };
  },
  expectedFormat?: string
): ValidationResult {
  return contract.validateOutput(analysisResult, expectedFormat);
}

import { NextResponse } from "next/server";
import { isAllowedImageType, validateImageMagicBytes } from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCampaignById } from "@/server/repositories/campaign";
import { analyzeCompetitorCreative } from "@/server/ai/competitor-analyzer";
import { spendOrApiError } from "@/server/billing/paywall";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 3;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const campaign = await getCampaignById(campaignId, workspace.id);
    if (!campaign) {
      return apiError("campaignNotFound", 404);
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > MAX_SIZE * MAX_FILES) {
        return apiError("fileTooLarge", 400);
      }
    }

    const formData = await request.formData();
    const files = formData.getAll("files");

    if (files.length === 0) {
      return apiError("invalidInput", 400);
    }

    if (files.length > MAX_FILES) {
      return apiError("invalidInput", 400, { detail: "Maximum 3 screenshots allowed" });
    }

    const validFiles: Array<{ file: File; type: "image/png" | "image/jpeg" | "image/webp" }> = [];
    for (const file of files) {
      if (!(file instanceof File)) {
        return apiError("invalidInput", 400);
      }
      if (!isAllowedImageType(file.type)) {
        return apiError("invalidFileType", 400);
      }
      if (file.size <= 0 || file.size > MAX_SIZE) {
        return apiError("fileTooLarge", 400);
      }
      validFiles.push({ file, type: file.type });
    }

    const magicChecks = await Promise.all(
      validFiles.map(({ file, type }) => validateImageMagicBytes(file, type))
    );
    if (magicChecks.some((isValid) => !isValid)) {
      return apiError("invalidFileType", 400);
    }

    const name = (formData.get("name") as string | null) ?? undefined;
    const platform = (formData.get("platform") as string | null) ?? undefined;

    const creditError = await spendOrApiError({
      workspaceId: workspace.id,
      action: "image_derivation",
      idempotencyKey: `competitor-analyze:${campaignId}:${validFiles.map(({ file }) => file.name).join("|")}`,
      metadata: { campaignId, fileCount: validFiles.length },
    });
    if (creditError) return creditError;

    // Analyze each screenshot in parallel and merge results
    const analyses = await Promise.all(
      validFiles.map(async ({ file }) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return analyzeCompetitorCreative(buffer, file.type, name, platform);
      })
    );

    // Merge multiple analyses into a single result
    const merged = mergeAnalyses(analyses);

    return NextResponse.json({ analysis: merged });
  } catch (error) {
    return handleApiError(error, "campaigns.[id].competitors.analyze.POST");
  }
}

function mergeAnalyses(analyses: Awaited<ReturnType<typeof analyzeCompetitorCreative>>[]) {
  if (analyses.length === 0) {
    throw new Error("No analyses to merge");
  }
  if (analyses.length === 1) {
    return analyses[0];
  }

  const first = analyses[0];

  // Deduplicate arrays across all analyses
  const allStrengths = [...new Set(analyses.flatMap((a) => a.strengths))];
  const allWeaknesses = [...new Set(analyses.flatMap((a) => a.weaknesses))];
  const allOpportunities = [...new Set(analyses.flatMap((a) => a.differentiationOpportunities))];

  // Merge visual patterns: prefer non-empty values
  const mergedColors = first.visualPatterns.colors ?? [];
  const mergedComposition = analyses.find((a) => a.visualPatterns.composition)?.visualPatterns.composition ?? "";
  const mergedTypography = analyses.find((a) => a.visualPatterns.typography)?.visualPatterns.typography ?? "";

  // Merge messaging: prefer non-empty values
  const mergedHeadline = analyses.find((a) => a.messaging.headlineStyle)?.messaging.headlineStyle ?? "";
  const mergedCta = analyses.find((a) => a.messaging.ctaStyle)?.messaging.ctaStyle ?? "";
  const mergedOffer = analyses.find((a) => a.messaging.offerType)?.messaging.offerType ?? "";

  return {
    visualPatterns: {
      colors: mergedColors.length ? mergedColors : undefined,
      composition: mergedComposition || undefined,
      typography: mergedTypography || undefined,
    },
    messaging: {
      headlineStyle: mergedHeadline || undefined,
      ctaStyle: mergedCta || undefined,
      offerType: mergedOffer || undefined,
    },
    strengths: allStrengths.slice(0, 6),
    weaknesses: allWeaknesses.slice(0, 6),
    differentiationOpportunities: allOpportunities.slice(0, 6),
  };
}

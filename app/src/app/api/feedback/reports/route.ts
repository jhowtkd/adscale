import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  sanitizeDiagnosticContext,
} from "@/server/feedback/sanitize";
import {
  FeedbackValidationError,
  validateAssetRefs,
  validateCampaignOwnership,
  validateDerivationOwnership,
} from "@/server/feedback/validate-refs";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import {
  createFeedbackReport,
  listFeedbackReports,
  type FeedbackSeverity,
  type FeedbackStatus,
  type FeedbackType,
  type FeedbackCategory,
} from "@/server/repositories/feedback";

const feedbackLogger = logger.child("feedback");

const assetRefSchema = z.object({
  kind: z.enum(["campaign_asset", "workspace_asset", "derivation_output"]),
  id: z.string().uuid(),
  key: z.string().max(500).optional(),
});

const createFeedbackSchema = z.object({
  type: z.enum(["bug", "suggestion", "question", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  category: z.enum(["ui", "generation", "billing", "performance", "mission", "other"]),
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX_LENGTH),
  followUpAllowed: z.boolean().optional().default(false),
  route: z.string().max(500).optional(),
  contextKind: z.enum(["global", "campaign", "derivation"]).optional().default("global"),
  campaignId: z.string().uuid().optional().nullable(),
  derivationId: z.string().uuid().optional().nullable(),
  assetRefs: z.array(assetRefSchema).max(20).optional().default([]),
  diagnosticContext: z.record(z.string(), z.unknown()).optional(),
  sentryCorrelation: z.record(z.string(), z.unknown()).optional(),
  contextCompleteness: z.record(z.string(), z.unknown()).optional(),
});

function getRequestId(request: Request): string | undefined {
  return (
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    undefined
  );
}

export async function GET(request: Request) {
  try {
    await requirePlatformOwner(request);
    const { searchParams } = new URL(request.url);

    const reports = await listFeedbackReports({
      workspaceId: searchParams.get("workspaceId") ?? undefined,
      status: (searchParams.get("status") as FeedbackStatus | null) ?? undefined,
      type: (searchParams.get("type") as FeedbackType | null) ?? undefined,
      severity:
        (searchParams.get("severity") as FeedbackSeverity | null) ?? undefined,
      category: (searchParams.get("category") as FeedbackCategory | null) ?? undefined,
      route: searchParams.get("route") ?? undefined,
      campaignId: searchParams.get("campaignId") ?? undefined,
      from: searchParams.get("from")
        ? new Date(searchParams.get("from")!)
        : undefined,
      to: searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined,
      limit: searchParams.get("limit")
        ? Number(searchParams.get("limit"))
        : undefined,
      offset: searchParams.get("offset")
        ? Number(searchParams.get("offset"))
        : undefined,
    });

    return NextResponse.json({ reports });
  } catch (error) {
    return handleApiError(error, "feedback.reports.GET");
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { user, workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = createFeedbackSchema.safeParse(body);

    if (!parsed.success) {
      feedbackLogger.warn("feedback.create.validation_failed", {
        workspaceId: workspace.id,
        userId: user.id,
        requestId,
        issues: parsed.error.issues.map((issue) => issue.path.join(".")),
      });
      return apiError("validation_error", 400, parsed.error.flatten());
    }

    const data = parsed.data;

    if (data.campaignId) {
      await validateCampaignOwnership(workspace.id, data.campaignId);
    }

    if (data.derivationId) {
      await validateDerivationOwnership(
        workspace.id,
        data.derivationId,
        data.campaignId
      );
    }

    const assetRefs = await validateAssetRefs(workspace.id, data.assetRefs);

    const diagnosticContext = sanitizeDiagnosticContext({
      ...(data.diagnosticContext ?? {}),
    });
    const sentryCorrelation = sanitizeDiagnosticContext(
      data.sentryCorrelation ?? {}
    );
    const contextCompleteness = sanitizeDiagnosticContext(
      data.contextCompleteness ?? {}
    );

    const report = await createFeedbackReport({
      workspaceId: workspace.id,
      userId: user.id,
      type: data.type,
      severity: data.severity,
      category: data.category,
      message: data.message,
      followUpAllowed: data.followUpAllowed,
      route: data.route,
      contextKind: data.contextKind,
      campaignId: data.campaignId,
      derivationId: data.derivationId,
      assetRefs,
      diagnosticContext,
      sentryCorrelation,
      contextCompleteness,
    });

    feedbackLogger.info("feedback.create.success", {
      reportId: report.id,
      workspaceId: workspace.id,
      userId: user.id,
      requestId,
      contextKind: report.contextKind,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    if (error instanceof FeedbackValidationError) {
      feedbackLogger.warn("feedback.create.rejected", {
        code: error.code,
        requestId,
      });
      return apiError(error.code, 400);
    }

    return handleApiError(error, "feedback.reports.POST");
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  columnMappingSchema,
  confirmImport,
  parseOptionsSchema,
  previewCsvImport,
} from "@/server/performance/import/service";
import type { ImportPreviewResult } from "@/server/performance/import/types";
import { CSV_MAX_BYTES } from "@/server/performance/import/types";
import { PerformanceDomainError } from "@/server/performance/service";

const previewResultSchema = z
  .object({
    rows: z.array(z.unknown()),
    summary: z.object({
      total: z.number(),
      valid: z.number(),
      invalid: z.number(),
      wouldCreate: z.number(),
      wouldUpdate: z.number(),
      wouldIgnore: z.number(),
    }),
  })
  .passthrough();

const confirmBodySchema = z
  .object({
    sourceType: z.enum(["manual", "csv"]),
    parseOptions: parseOptionsSchema,
    preview: previewResultSchema,
    fileName: z.string().optional().nullable(),
    fileHash: z.string().optional().nullable(),
    columnMapping: columnMappingSchema.optional().nullable(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ user, workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const columnMappingRaw = formData.get("columnMapping");
      const parseOptionsRaw = formData.get("parseOptions");

      if (!(file instanceof File)) {
        return apiError("invalidInput", 400);
      }
      if (typeof columnMappingRaw !== "string" || typeof parseOptionsRaw !== "string") {
        return apiError("invalidInput", 400);
      }
      if (file.size <= 0 || file.size > CSV_MAX_BYTES) {
        return apiError("importFileTooLarge", 400);
      }

      const columnMapping = columnMappingSchema.safeParse(
        JSON.parse(columnMappingRaw)
      );
      const parseOptions = parseOptionsSchema.safeParse(
        JSON.parse(parseOptionsRaw)
      );
      if (!columnMapping.success || !parseOptions.success) {
        return apiError("validation_error", 400);
      }

      const content = await file.text();
      const preview = await previewCsvImport({
        campaignId,
        workspaceId: workspace.id,
        content,
        fileName: file.name,
        columnMapping: columnMapping.data,
        parseOptions: parseOptions.data,
      });

      const result = await confirmImport({
        campaignId,
        workspaceId: workspace.id,
        userId: user.id,
        sourceType: "csv",
        preview,
        fileName: file.name,
        fileHash: preview.fileHash ?? null,
        columnMapping: columnMapping.data,
        parseOptions: parseOptions.data,
      });

      return NextResponse.json({ result }, { status: 201 });
    }

    const body = confirmBodySchema.safeParse(await request.json());
    if (!body.success) {
      return apiError("validation_error", 400, body.error.flatten());
    }

    const result = await confirmImport({
      campaignId,
      workspaceId: workspace.id,
      userId: user.id,
      sourceType: body.data.sourceType,
      preview: body.data.preview as ImportPreviewResult,
      fileName: body.data.fileName ?? null,
      fileHash: body.data.fileHash ?? null,
      columnMapping: body.data.columnMapping ?? null,
      parseOptions: body.data.parseOptions,
    });

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    if (error instanceof PerformanceDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].performance.import.confirm.POST");
  }
}

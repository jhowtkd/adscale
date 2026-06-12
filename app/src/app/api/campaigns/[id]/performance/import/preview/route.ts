import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import {
  columnMappingSchema,
  manualImportInputSchema,
  parseOptionsSchema,
  previewCsvImport,
  previewManualImport,
} from "@/server/performance/import/service";
import { CSV_MAX_BYTES } from "@/server/performance/import/types";
import { PerformanceDomainError } from "@/server/performance/service";

const manualPreviewSchema = z
  .object({
    manual: manualImportInputSchema,
    parseOptions: parseOptionsSchema,
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ workspace }, { id: campaignId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const contentLengthHeader = request.headers.get("content-length");
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && contentLength > CSV_MAX_BYTES) {
          return apiError("importFileTooLarge", 400);
        }
      }

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
        return apiError("validation_error", 400, {
          columnMapping: columnMapping.success
            ? undefined
            : columnMapping.error.flatten(),
          parseOptions: parseOptions.success
            ? undefined
            : parseOptions.error.flatten(),
        });
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

      return NextResponse.json({ preview });
    }

    const body = manualPreviewSchema.safeParse(await request.json());
    if (!body.success) {
      return apiError("validation_error", 400, body.error.flatten());
    }

    const preview = await previewManualImport({
      campaignId,
      workspaceId: workspace.id,
      manual: body.data.manual,
      parseOptions: body.data.parseOptions,
    });

    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof PerformanceDomainError) {
      return apiError(error.code, error.status);
    }
    return handleApiError(error, "campaigns.[id].performance.import.preview.POST");
  }
}

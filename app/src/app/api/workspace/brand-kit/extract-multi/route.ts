import { NextResponse } from "next/server";
import { z } from "zod";
import {
  isAllowedImageType,
  sanitizeStorageFilename,
  validateImageMagicBytes,
} from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { extractBrandKitFromImage } from "@/server/ai/brand-kit-extractor";
import { spendOrApiError } from "@/server/billing/paywall";
import { objectStorage } from "@/server/storage";
import { createClientReference } from "@/server/repositories/client-reference";
import { createWorkspaceAsset } from "@/server/repositories/workspace-asset";
import { upsertBrandKit, resolveBrandKitProfileId } from "@/server/db/repositories/brand-kit";
import { inngest } from "@/server/jobs/client";

const MAX_SIZE = 10 * 1024 * 1024;
const MAX_ENTRIES = 12;

const entryKindSchema = z.enum(["guide", "logo", "creative"]);
type EntryKind = z.infer<typeof entryKindSchema>;

const entriesSchema = z
  .array(
    z.object({
      fileName: z.string().min(1),
      kind: entryKindSchema,
    }),
  )
  .min(1)
  .max(MAX_ENTRIES);

interface MultiExtractResult {
  /** Aggregated brand-kit fields merged across all `guide` extractions. */
  brandKit: {
    colors?: string[];
    fonts?: string[];
    toneOfVoice?: string;
    prohibitedElements?: string;
    requiredElements?: string;
    logoDescription?: string;
  };
  /** Persisted assets (logos + creatives) available for the curation step. */
  assets: Array<{
    kind: EntryKind;
    fileName: string;
    assetKey: string;
    url: string;
  }>;
  /** Per-entry charge outcomes, for transparency. */
  charges: Array<{ fileName: string; kind: EntryKind; charged: boolean }>;
}

/**
 * Multi-input brand extraction (plan Fase 4.2).
 *
 * Routes each uploaded file by its declared `kind`:
 * - `guide`  → vision extraction of palette/fonts/tone/rules (1 credit each).
 * - `logo`   → persisted to object storage + registered as a `logo` reference
 *              and as `logoAssetKey` on the profile. No charge.
 * - `creative` → persisted as a workspace asset only, returned for the
 *              curation gallery. No charge.
 *
 * Guide extractions are accumulated incrementally into a single editable
 * brand-kit draft; there is no LLM merge step (the user validates in the
 * wizard). The legacy mono-image `/extract` route is preserved for the
 * existing BrandKitTab.
 */
export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);

    const rateLimitResult = await checkRateLimit(request, {
      category: "ai",
      workspaceId: workspace.id,
    });
    if (rateLimitResult) return rateLimitResult;

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = parseInt(contentLengthHeader, 10);
      if (!isNaN(contentLength) && contentLength > MAX_SIZE * MAX_ENTRIES) {
        return apiError("fileTooLarge", 400);
      }
    }

    const formData = await request.formData();
    const clientProfileIdQuery = new URL(request.url).searchParams.get("clientProfileId");
    const clientProfileId = clientProfileIdQuery ?? undefined;

    const rawEntries = formData.get("entries");
    if (typeof rawEntries !== "string") {
      return apiError("invalidInput", 400, { detail: "Missing 'entries' JSON field" });
    }

    let parsedEntries: z.infer<typeof entriesSchema>;
    try {
      parsedEntries = entriesSchema.parse(JSON.parse(rawEntries));
    } catch {
      return apiError("invalidInput", 400, { detail: "Invalid 'entries' payload" });
    }

    const result: MultiExtractResult = {
      brandKit: {},
      assets: [],
      charges: [],
    };

    for (const entry of parsedEntries) {
      const file = formData.get(entry.fileName);
      if (!(file instanceof File)) {
        return apiError("invalidInput", 400, {
          detail: `File not found for entry ${entry.fileName}`,
        });
      }
      if (!isAllowedImageType(file.type)) {
        return apiError("invalidFileType", 400);
      }
      if (!(await validateImageMagicBytes(file, file.type))) {
        return apiError("invalidFileType", 400);
      }
      if (file.size <= 0 || file.size > MAX_SIZE) {
        return apiError("fileTooLarge", 400);
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      if (entry.kind === "guide") {
        const creditError = await spendOrApiError({
          workspaceId: workspace.id,
          action: "creative_qa",
          amount: 1,
          idempotencyKey: `brand-kit-extract:${workspace.id}:${file.name}:${file.size}`,
          metadata: { workspaceId: workspace.id },
        });
        if (creditError) return creditError;

        const extracted = await extractBrandKitFromImage(buffer, file.type);
        accumulateExtracted(result.brandKit, extracted);
        result.charges.push({ fileName: entry.fileName, kind: entry.kind, charged: true });
        continue;
      }

      // logo & creative: persist to object storage (no extraction, no charge)
      const safeName = sanitizeStorageFilename(file.name);
      const key =
        entry.kind === "logo"
          ? `workspaces/${workspace.id}/brand-kit/${crypto.randomUUID()}-${safeName}`
          : `workspaces/${workspace.id}/assets/${crypto.randomUUID()}-${safeName}`;

      await objectStorage.put(key, buffer, file.type);

      if (entry.kind === "logo") {
        const profileId = await resolveBrandKitProfileId(workspace.id, clientProfileId ?? null);
        await upsertBrandKit(workspace.id, { logoAssetKey: key }, profileId);
        await createClientReference(workspace.id, {
          clientProfileId: profileId,
          assetKey: key,
          label: file.name,
          kind: "logo",
        });
      } else {
        // creative: register as a workspace asset and kick off AI analysis
        const asset = await createWorkspaceAsset({
          workspaceId: workspace.id,
          name: file.name,
          key,
          type: file.type,
          size: file.size,
        });
        await inngest.send({
          name: "workspace.asset.analyze",
          data: { assetId: asset.id, workspaceId: workspace.id, key },
        });
      }

      result.assets.push({
        kind: entry.kind,
        fileName: entry.fileName,
        assetKey: key,
        url: objectStorage.publicUrl(key),
      });
      result.charges.push({ fileName: entry.fileName, kind: entry.kind, charged: false });
    }

    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "workspace.brand-kit.extract-multi.POST");
  }
}

type BrandKitDraft = MultiExtractResult["brandKit"];

function accumulateExtracted(
  draft: BrandKitDraft,
  extracted: Awaited<ReturnType<typeof extractBrandKitFromImage>>,
): void {
  // Last non-empty wins for scalar fields; arrays are concatenated + deduped.
  if (extracted.colors.length > 0) {
    draft.colors = dedupe([...(draft.colors ?? []), ...extracted.colors]);
  }
  if (extracted.fonts.length > 0) {
    draft.fonts = dedupe([...(draft.fonts ?? []), ...extracted.fonts]);
  }
  if (extracted.toneOfVoice.trim()) draft.toneOfVoice = extracted.toneOfVoice.trim();
  if (extracted.prohibitedElements.trim()) draft.prohibitedElements = extracted.prohibitedElements.trim();
  if (extracted.requiredElements.trim()) draft.requiredElements = extracted.requiredElements.trim();
  if (extracted.logoDescription.trim()) draft.logoDescription = extracted.logoDescription.trim();
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((i) => i.trim()).filter(Boolean)));
}

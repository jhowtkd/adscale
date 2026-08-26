import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import pLimit from "p-limit";
import { z } from "zod";
import {
  isAllowedImageType,
  validateImageMagicBytes,
} from "@/lib/upload-config";
import { apiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit } from "@/lib/with-rate-limit";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { extractBrandKitFromImage } from "@/server/ai/brand-kit-extractor";
import { spendOrApiError } from "@/server/billing/paywall";
import { objectStorage } from "@/server/storage";
import {
  createClientReference,
  createTrainingReference,
  getTrainingReferenceByAssetKey,
} from "@/server/repositories/client-reference";
import {
  createWorkspaceAsset,
  getWorkspaceAssetByKey,
} from "@/server/repositories/workspace-asset";
import { normalizeTrainingUpload } from "@/server/brand-training/upload";
import { upsertBrandKit, resolveBrandKitProfileId } from "@/server/repositories/brand-kit";
import {
  sanitizeBrandColors,
  sanitizeBrandFonts,
} from "@/server/brand-kit/sanitize";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { compileBrandKnowledgeCandidates } from "@/server/brand-knowledge/candidate-compiler";
import { createBrandKnowledgeCandidates } from "@/server/repositories/brand-knowledge";

const MAX_SIZE = 10 * 1024 * 1024;
const MAX_ENTRIES = 12;
/** Cap parallel vision calls to avoid memory spikes on small Render instances. */
const GUIDE_EXTRACT_CONCURRENCY = 2;

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

type PreparedEntry = {
  entry: z.infer<typeof entriesSchema>[number];
  file: File;
  buffer: Buffer;
};

/**
 * Multi-input brand extraction (plan Fase 4.2).
 *
 * Routes each uploaded file by its declared `kind`:
 * - `guide`  → persisted evidence + vision extraction of reviewable claims (1 credit each).
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

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseError) {
      if (
        parseError instanceof Error &&
        /Failed to parse body as FormData/i.test(parseError.message)
      ) {
        return apiError("fileTooLarge", 413, {
          detail:
            "Upload exceeded the request body limit. Try fewer or smaller images.",
        });
      }
      throw parseError;
    }
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

    const guides: PreparedEntry[] = [];
    const assets: PreparedEntry[] = [];

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

      const prepared: PreparedEntry = {
        entry,
        file,
        buffer: Buffer.from(await file.arrayBuffer()),
      };

      if (entry.kind === "guide") {
        guides.push(prepared);
      } else {
        assets.push(prepared);
      }
    }

    const profileId = await resolveBrandKitProfileId(
      workspace.id,
      clientProfileId ?? null,
    );

    for (const { file } of guides) {
      const creditError = await spendOrApiError({
        workspaceId: workspace.id,
        action: "creative_qa",
        idempotencyKey: `brand-kit-extract:${workspace.id}:${file.name}:${file.size}`,
        metadata: { workspaceId: workspace.id },
      });
      if (creditError) return creditError;
    }

    const extractGuide = pLimit(GUIDE_EXTRACT_CONCURRENCY);
    const guideExtractions = await Promise.all(
      guides.map(({ entry, file, buffer }) =>
        extractGuide(async () => {
          const extracted = await extractBrandKitFromImage(buffer, file.type);
          return { entry, file, extracted };
        }),
      ),
    );

    for (const { entry, file, extracted } of guideExtractions) {
      accumulateExtracted(result.brandKit, extracted);
      const normalized = await normalizeTrainingUpload(file);
      const sourceHash = createHash("sha256").update(normalized.buffer).digest("hex");
      const key = `workspaces/${workspace.id}/brand-guides/${profileId}/${sourceHash.slice(0, 24)}.${normalized.extension}`;
      let asset = await getWorkspaceAssetByKey(workspace.id, key);
      if (!asset) {
        await objectStorage.put(key, normalized.buffer, normalized.type);
        asset = await createWorkspaceAsset({
          workspaceId: workspace.id,
          name: file.name,
          key,
          type: normalized.type,
          size: normalized.buffer.byteLength,
          source: "brand_training",
          metadata: { ingestionKind: "guide", originalMimeType: file.type, sha256: sourceHash },
        });
      }
      const reference = (await getTrainingReferenceByAssetKey(workspace.id, profileId, key))
        ?? (await createClientReference(workspace.id, {
          clientProfileId: profileId,
          assetKey: key,
          label: file.name,
          kind: "brand_guide",
        }));
      await createBrandKnowledgeCandidates(
        workspace.id,
        profileId,
        compileBrandKnowledgeCandidates({
          evidence: { type: "brand_guide", id: reference.id, sourceHash },
          extracted,
        }),
      );
      result.assets.push({ kind: "guide", fileName: entry.fileName, assetKey: key, url: objectStorage.publicUrl(key) });
      result.charges.push({ fileName: entry.fileName, kind: entry.kind, charged: true });
    }

    // Persist the extracted draft immediately. The validation step can still
    // edit and overwrite it, but advancing without pressing Save must not
    // leave Voice or downstream generation with an empty Brand Kit.
    if (guideExtractions.length > 0) {
      await upsertBrandKit(
        workspace.id,
        {
          brandColors: sanitizeBrandColors(result.brandKit.colors ?? []),
          brandFonts: sanitizeBrandFonts(result.brandKit.fonts ?? []),
          toneOfVoice: result.brandKit.toneOfVoice ?? "",
          prohibitedElements: result.brandKit.prohibitedElements ?? "",
          requiredElements: result.brandKit.requiredElements ?? "",
        },
        profileId,
      );
    }

    for (const { entry, file } of assets) {
      const normalized = await normalizeTrainingUpload(file);
      const digest = createHash("sha256").update(normalized.buffer).digest("hex").slice(0, 24);
      const sourceHash = createHash("sha256").update(normalized.buffer).digest("hex");
      const key =
        entry.kind === "logo"
          ? `workspaces/${workspace.id}/brand-kit/${profileId}/${digest}.${normalized.extension}`
          : `workspaces/${workspace.id}/brand-training/${profileId}/${digest}.${normalized.extension}`;

      let asset = await getWorkspaceAssetByKey(workspace.id, key);
      if (!asset) {
        await objectStorage.put(key, normalized.buffer, normalized.type);
        asset = await createWorkspaceAsset({
          workspaceId: workspace.id,
          name: file.name,
          key,
          type: normalized.type,
          size: normalized.buffer.byteLength,
          source: "brand_training",
          metadata: {
            hasAlpha: normalized.hasAlpha,
            originalMimeType: file.type,
            ingestionKind: entry.kind,
            sha256: sourceHash,
          },
        });
      }

      if (entry.kind === "logo") {
        await upsertBrandKit(workspace.id, { logoAssetKey: key }, profileId);
      }

      const reference =
        (await getTrainingReferenceByAssetKey(workspace.id, profileId, key)) ??
        (await createTrainingReference(workspace.id, {
          clientProfileId: profileId,
          assetKey: key,
          label: file.name,
        }));
      await inngest.send({
        name: heavyImageEventName("brand.training.analyze"),
        data: {
          workspaceId: workspace.id,
          clientProfileId: profileId,
          referenceId: reference.id,
          assetKey: key,
          mimeType: normalized.type,
          hasAlpha: normalized.hasAlpha,
        },
      });

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

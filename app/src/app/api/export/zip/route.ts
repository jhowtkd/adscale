import { NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import pLimit from "p-limit";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/server/db";
import { assistantGoalRuns, derivations } from "@/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { objectStorage } from "@/server/storage";
import { getCampaignById } from "@/server/repositories/campaign";
import { GOAL_FORMATS } from "@/lib/assistant/goal";

const bodySchema = z
  .object({
    derivationIds: z.array(z.string().uuid()).min(1).max(50).optional(),
    goalRunId: z.string().uuid().optional(),
  })
  .refine((v) => !!v.derivationIds !== !!v.goalRunId, {
    message: "Provide exactly one of derivationIds or goalRunId",
  });

const FORMAT_TO_SUFFIX: Record<string, string> = {
  "1:1": "1x1",
  "4:5": "4x5",
  "9:16": "9x16",
  "16:9": "16x9",
};

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "adscale"
  );
}

interface ExportItem {
  id: string;
  format: string | null;
  status: string;
  outputKey: string | null;
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimit(request, "general");
    if (!limit.success) {
      return apiError("rateLimitExceeded", 429);
    }

    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("invalidRequestBody", 400);
    }

    const goalRunId = parsed.data.goalRunId;

    // ---- Goal branch: resolve the four approved canonical formats ----
    if (goalRunId) {
      return resolveGoalExport(workspace.id, goalRunId);
    }

    // ---- Legacy branch: explicit derivation ids ----
    const derivationIds = parsed.data.derivationIds!;
    const items: ExportItem[] = await db
      .select()
      .from(derivations)
      .where(
        and(
          eq(derivations.workspaceId, workspace.id),
          eq(derivations.status, "approved"),
          inArray(derivations.id, derivationIds)
        )
      );

    if (items.length === 0) {
      return apiError("nothingToExport", 400);
    }

    const zip = await buildZip(items, (item) => {
      const suffix = (item.format && FORMAT_TO_SUFFIX[item.format]) || "creative";
      return `derivation-${item.id}-${suffix}.png`;
    });

    if (!zip.filesAdded) {
      return apiError("nothingToExport", 400);
    }

    return new NextResponse(new Uint8Array(zip.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="adscale-derivations-${Date.now()}.zip"`,
      },
    });
  } catch (error) {
    return handleApiError(error, "export.zip.POST");
  }
}

async function resolveGoalExport(workspaceId: string, goalRunId: string) {
  const [goalRow] = await db
    .select()
    .from(assistantGoalRuns)
    .where(
      and(
        eq(assistantGoalRuns.id, goalRunId),
        eq(assistantGoalRuns.workspaceId, workspaceId)
      )
    )
    .limit(1);

  if (!goalRow || !goalRow.campaignId) {
    return apiError("goalNotFound", 404);
  }

  const approved = (await db
    .select()
    .from(derivations)
    .where(
      and(
        eq(derivations.workspaceId, workspaceId),
        eq(derivations.campaignId, goalRow.campaignId),
        eq(derivations.status, "approved"),
        inArray(
          derivations.format,
          GOAL_FORMATS as unknown as string[]
        )
      )
    )) as ExportItem[];

  // Require exactly one approved derivation per required format.
  const byFormat = new Map<string, ExportItem>();
  for (const item of approved) {
    if (item.format && !byFormat.has(item.format)) {
      byFormat.set(item.format, item);
    }
  }
  const missing = GOAL_FORMATS.filter((f) => !byFormat.has(f));
  if (missing.length > 0) {
    return apiError("nothingToExport", 400);
  }

  const campaign = await getCampaignById(goalRow.campaignId, workspaceId);
  const slug = slugify(campaign?.name ?? "adscale");
  const objective = goalRow.objective || campaign?.objective || "";

  // Manifest with stable, safe metadata. No output keys, signed URLs, prompts,
  // or provider data.
  const manifest = {
    schemaVersion: 1,
    client: campaign?.client ?? campaign?.name ?? slug,
    campaign: campaign?.name ?? slug,
    objective,
    approvedAt: new Date().toISOString(),
    files: GOAL_FORMATS.map((f) => {
      const suffix = FORMAT_TO_SUFFIX[f];
      return { format: f, fileName: `${slug}-${suffix}.png`, version: 1 };
    }),
  };

  const zip = await buildZip(
    GOAL_FORMATS.map((f) => byFormat.get(f)!),
    (item) => {
      const suffix = FORMAT_TO_SUFFIX[item.format ?? ""] ?? "creative";
      return `${slug}-${suffix}.png`;
    },
    manifest
  );

  return new NextResponse(new Uint8Array(zip.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-goal-package.zip"`,
    },
  });
}

interface BuildZipResult {
  buffer: Buffer;
  filesAdded: number;
}

async function buildZip(
  items: ExportItem[],
  fileNameFor: (item: ExportItem) => string,
  manifest?: unknown
): Promise<BuildZipResult> {
  const zip = new JSZip();
  let filesAdded = 0;
  const concurrency = pLimit(4);

  const files = await Promise.all(
    items.map((item) =>
      concurrency(async () => {
        if (!item.outputKey) return null;
        try {
          const buffer = await objectStorage.get(item.outputKey);
          return { fileName: fileNameFor(item), buffer };
        } catch {
          return null;
        }
      })
    )
  );
  for (const file of files) {
    if (!file) continue;
    zip.file(file.fileName, file.buffer);
    filesAdded++;
  }

  // The manifest is added BEFORE generation so it is part of the archive.
  if (manifest) {
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  }

  return {
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
    filesAdded,
  };
}

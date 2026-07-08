/**
 * Deterministic fixtures for the standalone Create Post acceptance gate
 * (Playwright + API specs).
 *
 * Creates one workspace-owned dev environment with:
 *   - two client profiles (Create Post flow + isolation control)
 *   - one approved transparent logo asset (workspace + reference row)
 *   - one approved reference asset (visual_reference)
 *   - one pending reference asset (must be excluded from the assets step)
 *   - one ready `creative_work_items` fixture in `ready` status with a frozen
 *     identity snapshot — drives the e2e tests that don't need a live
 *     generation pipeline.
 *
 * Writes the resolved IDs to
 *   `app/tests/fixtures/create-post-e2e.json`
 *
 * Uses the dev-admin workspace seeded by `seed-dev-admin.ts`. Never touches
 * production credentials or external customer data.
 *
 * Usage:
 *   npm run seed:create-post-e2e
 */

import "./load-env";

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { and, desc, eq, like } from "drizzle-orm";

import { db } from "../src/server/db";
import {
  clientProfiles,
  clientReferences,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  workspaceAssets,
  workspaceMembers,
  workspaces,
} from "../src/server/db/schema";
import { createClientProfile } from "../src/server/repositories/client-reference";
import { createWorkspaceAsset } from "../src/server/repositories/workspace-asset";
import { objectStorage } from "../src/server/storage";
import { upsertBrandKit } from "../src/server/db/repositories/brand-kit";
import { createIdentitySnapshot } from "../src/server/creative-work/identity";
import {
  confirmCreativeWorkIdentity,
  createCreativeWork,
  createCreativeWorkOutputs,
  setCreativeWorkCopy,
} from "../src/server/repositories/creative-work";
import type { BrandTrainingAnalysis } from "../src/server/brand-training/contracts";

const DEV_EMAIL = "dev-admin@adscale.local";
const PRIMARY_CLIENT_NAME = "Create Post E2E Brand";
const SECONDARY_CLIENT_NAME = "Create Post E2E Other Brand";
const FIXTURE_PATH = path.resolve(
  __dirname,
  "../tests/fixtures/create-post-e2e.json",
);

/** 8x8 fully transparent PNG so composite-acceptance can rely on alpha=1. */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQAAAAAAAAAAAAAATklEQVR42mP8z8AARFAwiokQGAUjkIogsJgFgYGBgYEBAEyFAQB6fAhT8pxGgwAAAABJRU5ErkJggg==",
  "base64",
);

/** 64x64 deterministic solid magenta PNG (no alpha). */
async function buildOpaquePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 255, g: 0, b: 128 },
    },
  })
    .png()
    .toBuffer();
}

/** 64x64 deterministic green PNG (no alpha) — visual reference for style-only assets. */
async function buildVisualReferencePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 32, g: 192, b: 96 },
    },
  })
    .png()
    .toBuffer();
}

const SAMPLE_ANALYSIS: BrandTrainingAnalysis = {
  description: "E2E fixture brand asset",
  visualAttributes: ["deterministic", "solid"],
  rules: ["keep-on-white"],
  constraints: ["no-overlay"],
  confidence: 1,
};

async function resolveDevWorkspace(): Promise<{
  userId: string;
  workspaceId: string;
}> {
  const account = await db
    .select()
    .from(user)
    .where(eq(user.email, DEV_EMAIL))
    .limit(1);
  if (!account[0]) {
    throw new Error(
      `No user ${DEV_EMAIL}. Run \`npm run seed:dev-admin -- --create --email=${DEV_EMAIL}\` first.`,
    );
  }
  const membership = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, account[0].id))
    .limit(1);
  if (!membership[0]) {
    throw new Error(`User ${DEV_EMAIL} has no workspace.`);
  }
  return { userId: account[0].id, workspaceId: membership[0].workspaceId };
}

async function clearPreviousSeed(workspaceId: string): Promise<void> {
  // Drop every creative-work item that belongs to one of our profiles so we
  // never accumulate garbage across reseeds. We intentionally leave
  // `campaigns` alone so the acceptance test can prove no campaign row was
  // ever created by the Create Post flow.
  const previousProfiles = await db
    .select({ id: clientProfiles.id })
    .from(clientProfiles)
    .where(
      and(
        eq(clientProfiles.workspaceId, workspaceId),
        like(clientProfiles.name, "Create Post E2E%"),
      ),
    );

  for (const profile of previousProfiles) {
    await db
      .delete(creativeWorkItems)
      .where(eq(creativeWorkItems.clientProfileId, profile.id));
    await db
      .delete(clientReferences)
      .where(eq(clientReferences.clientProfileId, profile.id));
  }

  await db
    .delete(clientProfiles)
    .where(
      and(
        eq(clientProfiles.workspaceId, workspaceId),
        like(clientProfiles.name, "Create Post E2E%"),
      ),
    );

  await db
    .delete(workspaceAssets)
    .where(
      and(
        eq(workspaceAssets.workspaceId, workspaceId),
        like(workspaceAssets.name, "create-post-e2e-%"),
      ),
    );
}

async function ensureClientProfile(
  workspaceId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const existing = await db
    .select()
    .from(clientProfiles)
    .where(
      and(
        eq(clientProfiles.workspaceId, workspaceId),
        eq(clientProfiles.name, name),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { id: existing[0].id, name: existing[0].name };
  }
  const created = await createClientProfile(workspaceId, { name });
  return { id: created.id, name: created.name };
}

async function uploadFixtureAsset(input: {
  workspaceId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ key: string; assetId: string }> {
  const safeName = input.filename.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
  const key = `e2e/create-post/${input.workspaceId.slice(0, 8)}/${Date.now()}-${safeName}`;
  await objectStorage.put(key, input.buffer, input.contentType);
  const meta = await sharp(input.buffer).metadata();
  const asset = await createWorkspaceAsset({
    workspaceId: input.workspaceId,
    key,
    name: `create-post-e2e-${safeName}`,
    type: input.contentType,
    size: input.buffer.byteLength,
    width: meta.width ?? null,
    height: meta.height ?? null,
    source: "seed",
    metadata: {
      hasAlpha: Boolean(meta.hasAlpha),
      e2eFixture: true,
    },
  });
  return { key, assetId: asset.id };
}

async function seedBrandKit(profileId: string): Promise<void> {
  await upsertBrandKit(
    profileId,
    {
      name: PRIMARY_CLIENT_NAME,
      description: "Seed profile used by Create Post acceptance gate",
      brandColors: ["#FF0080", "#20C060"],
      brandFonts: ["Inter", "Roboto"],
      toneOfVoice: "Calmo, direto, orientado a beneficios",
      prohibitedElements: "sem texto em vermelho",
      requiredElements: "logo canto inferior direito",
    },
    profileId,
  );
}

interface ReferenceSeed {
  label: string;
  category: "logo" | "visual_reference" | "graphic";
  usageMode: "exact" | "reference";
  reviewStatus: "approved" | "pending_analysis";
  buffer: Buffer;
  contentType: string;
}

async function seedReference(
  workspaceId: string,
  clientProfileId: string,
  reviewerId: string,
  spec: ReferenceSeed,
): Promise<{ id: string; assetKey: string }> {
  const uploaded = await uploadFixtureAsset({
    workspaceId,
    filename: `${spec.label}.png`,
    buffer: spec.buffer,
    contentType: spec.contentType,
  });

  const insert = await db
    .insert(clientReferences)
    .values({
      workspaceId,
      clientProfileId,
      assetKey: uploaded.key,
      label: spec.label,
      kind: spec.category === "logo" ? "logo" : "other",
      notes: `E2E fixture — ${spec.label}`,
      trainingCategory: spec.category,
      usageMode: spec.usageMode,
      reviewStatus: spec.reviewStatus,
      reviewedAt: spec.reviewStatus === "approved" ? new Date() : null,
      reviewedByUserId: spec.reviewStatus === "approved" ? reviewerId : null,
      trainingAnalysis:
        spec.reviewStatus === "approved" ? SAMPLE_ANALYSIS : null,
    })
    .returning();

  return { id: insert[0].id, assetKey: uploaded.key };
}

async function seedReadyWorkFixture(input: {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  approvedReferenceIds: string[];
}): Promise<string> {
  const work = await createCreativeWork({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    createdByUserId: input.userId,
    toolKind: "social_post",
    brief: {
      theme: "Novo produto",
      objective: "Gerar interesse",
      audience: "Empreendedores",
      offer: "Teste gratuito",
    },
    format: "4:5",
  });

  await setCreativeWorkCopy(input.workspaceId, work.id, {
    headline: "Aceitacao E2E",
    body: "Texto de copia deterministicamente gerado pelo seed.",
    cta: "Saiba mais",
  });

  const snapshot = await createIdentitySnapshot({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    selectedReferenceIds: input.approvedReferenceIds,
  });

  await confirmCreativeWorkIdentity(input.workspaceId, work.id, snapshot);

  const outputs = await createCreativeWorkOutputs(input.workspaceId, work.id);
  for (const output of outputs) {
    const buf =
      output.creativeLevel === "conservative"
        ? await buildOpaquePng()
        : output.creativeLevel === "balanced"
          ? await buildVisualReferencePng()
          : await buildOpaquePng();
    const key = `e2e/create-post/${input.workspaceId.slice(0, 8)}/${work.id.slice(0, 8)}-${output.creativeLevel}.png`;
    await objectStorage.put(key, buf, "image/png");
    await db
      .update(creativeWorkOutputs)
      .set({
        status: "completed",
        outputKey: key,
        cost: 5,
        failureCode: null,
        quality: { e2eFixture: true },
        updatedAt: new Date(),
      })
      .where(eq(creativeWorkOutputs.id, output.id));
  }

  // Push the work into `completed` so the e2e never has to wait for the
  // background pipeline; the level-3 derivation triple lives in DB.
  await db
    .update(creativeWorkItems)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(creativeWorkItems.id, work.id));

  return work.id;
}

async function main(): Promise<void> {
  const { userId, workspaceId } = await resolveDevWorkspace();
  await clearPreviousSeed(workspaceId);

  const primary = await ensureClientProfile(workspaceId, PRIMARY_CLIENT_NAME);
  const secondary = await ensureClientProfile(
    workspaceId,
    SECONDARY_CLIENT_NAME,
  );

  await seedBrandKit(primary.id);

  const logoBuffer = await sharp(Buffer.from(TRANSPARENT_PNG))
    .resize(96, 96)
    .png()
    .toBuffer();
  const referenceBuffer = await buildVisualReferencePng();
  const opaqueBuffer = await buildOpaquePng();

  const logo = await seedReference(workspaceId, primary.id, userId, {
    label: "Logo Principal",
    category: "logo",
    usageMode: "exact",
    reviewStatus: "approved",
    buffer: logoBuffer,
    contentType: "image/png",
  });

  const visualRef = await seedReference(workspaceId, primary.id, userId, {
    label: "Referencia Visual",
    category: "visual_reference",
    usageMode: "reference",
    reviewStatus: "approved",
    buffer: referenceBuffer,
    contentType: "image/png",
  });

  await seedReference(workspaceId, primary.id, userId, {
    label: "Logo Pendente",
    category: "graphic",
    usageMode: "exact",
    reviewStatus: "pending_analysis",
    buffer: opaqueBuffer,
    contentType: "image/png",
  });

  const readyWorkId = await seedReadyWorkFixture({
    workspaceId,
    userId,
    clientProfileId: primary.id,
    approvedReferenceIds: [logo.id, visualRef.id],
  });

  const workspaceName = (
    await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
  )[0]?.name;

  const fixture = {
    workspaceId,
    workspaceName: workspaceName ?? null,
    userId,
    primaryClientProfileId: primary.id,
    secondaryClientProfileId: secondary.id,
    approvedLogoReferenceId: logo.id,
    approvedLogoAssetKey: logo.assetKey,
    approvedVisualReferenceId: visualRef.id,
    approvedVisualReferenceAssetKey: visualRef.assetKey,
    pendingReferenceLabel: "Logo Pendente",
    readyWorkId,
    seededAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);

  // We also persist a `desc`-ordered reference row snapshot so the test can
  // assert `pending` exclusion without re-querying.
  const approvedRows = await db
    .select({
      id: clientReferences.id,
      label: clientReferences.label,
      reviewStatus: clientReferences.reviewStatus,
      trainingCategory: clientReferences.trainingCategory,
      usageMode: clientReferences.usageMode,
    })
    .from(clientReferences)
    .where(eq(clientReferences.clientProfileId, primary.id))
    .orderBy(desc(clientReferences.createdAt));

  console.log("Create Post E2E seed ready:");
  console.log(JSON.stringify({ fixture, references: approvedRows }, null, 2));
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
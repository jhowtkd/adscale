/**
 * Deterministic fixtures for the standalone Create Post acceptance gate
 * (Playwright + API specs).
 *
 * Creates one dedicated workspace-owned dev environment with:
 *   - exactly one client profile, proving automatic global-brand selection
 *   - one approved transparent logo asset (workspace + reference row)
 *   - one approved reference asset (visual_reference)
 *   - one pending reference asset (must be excluded from the assets step)
 *   - one ready canonical creative-work fixture with a frozen
 *     identity snapshot — drives the e2e tests that don't need a live
 *     generation pipeline.
 *
 * Writes the resolved IDs to
 *   `app/tests/fixtures/create-post-e2e.json`
 *
 * Uses a dedicated synthetic login and workspace. Never touches the shared
 * dev-admin workspace, production credentials or external customer data.
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
import { auth } from "../src/server/auth";
import { env } from "../src/server/validation/env";
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
import { upsertBrandKit } from "../src/server/repositories/brand-kit";
import { createIdentitySnapshot } from "../src/server/creative-work/identity";
import {
  confirmCreativeWorkIdentity,
  createCreativeWork,
  createCreativeWorkOutputs,
  setCreativeWorkCopy,
} from "../src/server/repositories/creative-work";
import type { BrandTrainingAnalysis } from "../src/server/brand-training/contracts";
import {
  createCreditGrant,
  saveBillingCustomer,
  upsertSubscription,
} from "../src/server/repositories/billing";

const E2E_EMAIL = "frictionless-e2e@adscale.local";
const E2E_PASSWORD = "FrictionlessE2E123!";
const PRIMARY_CLIENT_NAME = "Create Post E2E Brand";
const FIXTURE_PATH = path.resolve(
  __dirname,
  "../tests/fixtures/create-post-e2e.json",
);

/** Valid fully transparent PNG so composite-acceptance can rely on alpha=1. */
async function buildTransparentPng(): Promise<Buffer> {
  const transparentCanvas = sharp({
    create: {
      width: 96,
      height: 96,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  const visibleMark = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 24, g: 72, b: 216, alpha: 1 },
    },
  }).png().toBuffer();
  return transparentCanvas
    .composite([{ input: visibleMark, left: 16, top: 16 }])
    .png()
    .toBuffer();
}

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

async function resolveDedicatedWorkspace(): Promise<{
  userId: string;
  workspaceId: string;
}> {
  let account = await db
    .select()
    .from(user)
    .where(eq(user.email, E2E_EMAIL))
    .limit(1);
  if (!account[0]) {
    await auth.api.signUpEmail({
      body: {
        email: E2E_EMAIL,
        password: E2E_PASSWORD,
        name: "Frictionless E2E",
      },
    });
    account = await db
      .select()
      .from(user)
      .where(eq(user.email, E2E_EMAIL))
      .limit(1);
  }
  if (!account[0]) {
    throw new Error(`Could not create dedicated E2E user ${E2E_EMAIL}.`);
  }
  await db
    .update(user)
    .set({
      emailVerified: true,
      onboardingCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(user.id, account[0].id));
  const membership = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, account[0].id))
    .limit(1);
  if (!membership[0]) {
    throw new Error(`User ${E2E_EMAIL} has no workspace.`);
  }
  const workspaceId = membership[0].workspaceId;
  const compactId = workspaceId.replace(/-/g, "").slice(0, 24);
  const stripeCustomerId = `cus_e2e_${compactId}`;
  await saveBillingCustomer({ workspaceId, stripeCustomerId });
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
  await upsertSubscription({
    workspaceId,
    stripeSubscriptionId: `sub_e2e_${compactId}`,
    stripeCustomerId,
    status: "active",
    planKey: "scale",
    priceId: env.STRIPE_SCALE_PRICE_ID,
    currentPeriodStart: new Date(),
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
  });
  await createCreditGrant({
    workspaceId,
    source: "dev_admin_seed",
    sourceId: `frictionless-e2e-${Date.now()}`,
    amount: 10_000,
    expiresAt: null,
  });
  return { userId: account[0].id, workspaceId };
}

async function clearPreviousSeed(workspaceId: string): Promise<void> {
  // Drop every creative-work item that belongs to one of our profiles so we
  // never accumulate garbage across reseeds. We intentionally leave
  // `campaigns` alone so the acceptance test can prove no campaign row was
  // ever created by the Create Post flow.
  const previousProfiles = await db
    .select({ id: clientProfiles.id })
    .from(clientProfiles)
    .where(eq(clientProfiles.workspaceId, workspaceId));

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
    .where(eq(clientProfiles.workspaceId, workspaceId));

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

async function seedBrandKit(workspaceId: string, profileId: string): Promise<void> {
  await upsertBrandKit(
    workspaceId,
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
    // The retry-route contract only accepts `failed` outputs, so the
    // retry E2E needs at least one `failed` row in the seed. We mark
    // `bold` as the failure case (conservative + balanced stay
    // completed so the visual composition test and the download test
    // keep their deterministic 64×64 logo region).
    const isFailed = output.creativeLevel === "bold";
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
        status: isFailed ? "failed" : "completed",
        outputKey: isFailed ? null : key,
        cost: 5,
        failureCode: isFailed ? "provider_error" : null,
        quality: isFailed ? null : { e2eFixture: true },
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
  const { userId, workspaceId } = await resolveDedicatedWorkspace();
  await clearPreviousSeed(workspaceId);

  const primary = await ensureClientProfile(workspaceId, PRIMARY_CLIENT_NAME);

  await seedBrandKit(workspaceId, primary.id);

  const logoBuffer = await buildTransparentPng();
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
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
    userId,
    primaryClientProfileId: primary.id,
    approvedLogoReferenceId: logo.id,
    approvedLogoAssetKey: logo.assetKey,
    // Embed the seeded logo buffer as base64 so the e2e composition test
    // can exercise the real server pipeline (`composeExactBrandAssets`)
    // without needing live object-storage access in CI.
    approvedLogoBufferBase64: logoBuffer.toString("base64"),
    attachmentBufferBase64: logoBuffer.toString("base64"),
    approvedLogoWidth: 96,
    approvedLogoHeight: 96,
    approvedVisualReferenceId: visualRef.id,
    approvedVisualReferenceAssetKey: visualRef.assetKey,
    pendingReferenceLabel: "Logo Pendente",
    readyWorkId,
    expectedInitialCredits: 15,
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

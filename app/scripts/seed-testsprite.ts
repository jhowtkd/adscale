/**
 * Idempotent fixtures for TestSprite / local E2E.
 *
 * Usage (app must use E2E_DISABLE_RATE_LIMIT for parallel logins):
 *   npx tsx scripts/seed-dev-admin.ts --create --email=dev-admin@adscale.local --password='DevAdmin123!'
 *   npx tsx scripts/seed-testsprite.ts
 *   E2E_DISABLE_RATE_LIMIT=true npm run start
 *
 * Outputs: testsprite_tests/testsprite-seed.json (tokens + fixture paths for agents)
 */
import "./load-env";
import fs from "fs";
import path from "path";
import { eq, and } from "drizzle-orm";
import { db } from "../src/server/db";
import {
  campaigns,
  campaignTemplates,
  derivations,
  shareLinks,
  user,
  workspaceAssets,
  workspaceInvites,
  workspaceMembers,
} from "../src/server/db/schema";
import { createCampaign } from "../src/server/repositories/campaign";
import { createShareLink } from "../src/server/repositories/share-link";
import { createWorkspaceAsset } from "../src/server/repositories/workspace-asset";
import { createPlan } from "../src/server/repositories/plan";
import { objectStorage } from "../src/server/storage";

const DEV_EMAIL = (
  process.env.TESTSPRITE_LOGIN_EMAIL ?? "dev-admin@adscale.local"
).toLowerCase();
const CAMPAIGN_NAME = "TestSprite E2E Campaign";
const SHARE_TOKEN = "testsprite-e2e-share";
const INVITE_TOKEN = "testsprite-e2e-invite";
const INVITE_EMAIL = "testsprite-invitee@adscale.local";
const TEMPLATE_NAME = "TestSprite Template";

function workspaceAssetKey(workspaceId: string) {
  return `testsprite/workspace-asset-${workspaceId.slice(0, 8)}.png`;
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

// Valid 64x64 PNGs (real pixels → pass server-side magic-byte validation for
// the /restyling base+style uploads). Distinct colors so they're visibly different.
const BASE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjJhMbywi+hcEKLNXzWgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgtZCaEttSk+KwAAAABJRU5ErkJggg==",
  "base64"
);
const STYLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjTsOawwi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgtp4QF4YWi5NgAAAABJRU5ErkJggg==",
  "base64"
);

const EMPTY_EMAIL = (
  process.env.TESTSPRITE_EMPTY_EMAIL ?? "empty@adscale.local"
).toLowerCase();
const EMPTY_PASSWORD = process.env.TESTSPRITE_EMPTY_PASSWORD ?? "DevAdmin123!";
// Dedicated account for the password-reset test so it never revokes sessions
// or changes credentials for accounts other tests depend on.
const RESET_EMAIL = (
  process.env.TESTSPRITE_RESET_EMAIL ?? "reset-user@adscale.local"
).toLowerCase();
const RESET_PASSWORD = process.env.TESTSPRITE_RESET_PASSWORD ?? "DevAdmin123!";

const FIXTURE_DIR = path.resolve(__dirname, "../tests/fixtures");
const PUBLIC_E2E_DIR = path.resolve(__dirname, "../public/e2e");
const SEED_JSON = path.resolve(
  __dirname,
  "../../testsprite_tests/testsprite-seed.json"
);

async function resolveDevWorkspace() {
  const account = await db
    .select()
    .from(user)
    .where(eq(user.email, DEV_EMAIL))
    .limit(1);

  if (!account[0]) {
    throw new Error(
      `No user ${DEV_EMAIL}. Run: npx tsx scripts/seed-dev-admin.ts --create --email=${DEV_EMAIL}`
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

async function clearPreviousSeed(workspaceId: string) {
  const existing = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.workspaceId, workspaceId),
        eq(campaigns.name, CAMPAIGN_NAME)
      )
    );

  for (const row of existing) {
    await db.delete(campaigns).where(eq(campaigns.id, row.id));
  }

  await db.delete(shareLinks).where(eq(shareLinks.token, SHARE_TOKEN));
  await db.delete(workspaceInvites).where(eq(workspaceInvites.token, INVITE_TOKEN));
  await db
    .delete(workspaceAssets)
    .where(eq(workspaceAssets.key, workspaceAssetKey(workspaceId)));
  await db
    .delete(campaignTemplates)
    .where(
      and(
        eq(campaignTemplates.workspaceId, workspaceId),
        eq(campaignTemplates.name, TEMPLATE_NAME)
      )
    );
}

async function writeFixtures() {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  // Local fixtures (kept .png so the bytes match the type the runner uploads).
  const basePath = path.join(FIXTURE_DIR, "base.png");
  const stylePath = path.join(FIXTURE_DIR, "style.png");
  fs.writeFileSync(basePath, BASE_PNG);
  fs.writeFileSync(stylePath, STYLE_PNG);

  // Publicly served copies so the cloud browser can fetch the bytes over the
  // tunnel and feed them to a file input via a Playwright buffer payload.
  fs.mkdirSync(PUBLIC_E2E_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_E2E_DIR, "base.png"), BASE_PNG);
  fs.writeFileSync(path.join(PUBLIC_E2E_DIR, "style.png"), STYLE_PNG);

  return { basePath, stylePath };
}

async function ensureAuxUser(email: string, password: string, name: string) {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  // Idempotent sign-up — "already exists" responses are fine to ignore.
  try {
    await fetch(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: base,
        Referer: `${base}/signup`,
      },
      body: JSON.stringify({ email, password, name }),
    });
  } catch {
    // Server may not be up yet on first pass; the DB check below will surface it.
  }

  const rows = await db.select().from(user).where(eq(user.email, email)).limit(1);

  if (!rows[0]) {
    console.warn(
      `[seed] Could not create aux user ${email} (is the server running?).`
    );
    return null;
  }

  await db
    .update(user)
    .set({ emailVerified: true, onboardingCompletedAt: new Date(), updatedAt: new Date() })
    .where(eq(user.id, rows[0].id));

  return { email, password };
}

async function main() {
  const { userId, workspaceId } = await resolveDevWorkspace();
  await clearPreviousSeed(workspaceId);
  const fixtures = await writeFixtures();
  const emptyUser = await ensureAuxUser(EMPTY_EMAIL, EMPTY_PASSWORD, "Empty Workspace");
  const resetUser = await ensureAuxUser(RESET_EMAIL, RESET_PASSWORD, "Reset Test");

  const storageKey = `testsprite/seed-output-${workspaceId.slice(0, 8)}.png`;
  await objectStorage.put(storageKey, PNG_1X1, "image/png");

  const campaign = await createCampaign(workspaceId, {
    name: CAMPAIGN_NAME,
    client: "TestSprite Brand",
    objective: "Drive signups for E2E validation",
    audience: "QA engineers",
    platforms: ["Instagram", "Facebook"],
    tone: "Profissional",
    offer: "20% off",
    constraints: "Keep logo visible",
    status: "active",
  });

  await createPlan(campaign.id, workspaceId, {
    strategy: "TestSprite seeded plan",
    angles: ["Social proof"],
    hooks: ["Limited time"],
    ctas: ["Sign up"],
  });

  const [derivation] = await db
    .insert(derivations)
    .values({
      campaignId: campaign.id,
      workspaceId,
      status: "completed",
      outputKey: storageKey,
      format: "1:1",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: "Shop Now",
      scoreStatus: "analyzed",
      qaStatus: "passed",
    })
    .returning();

  await createShareLink({
    token: SHARE_TOKEN,
    campaignId: campaign.id,
    workspaceId,
    derivationIds: [derivation.id],
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });

  await db.insert(workspaceInvites).values({
    workspaceId,
    email: INVITE_EMAIL,
    role: "member",
    token: INVITE_TOKEN,
    status: "pending",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdBy: userId,
  });

  await createWorkspaceAsset({
    workspaceId,
    name: "TestSprite Seed Asset",
    key: workspaceAssetKey(workspaceId),
    type: "image/png",
    size: PNG_1X1.length,
    width: 1,
    height: 1,
    source: "upload",
  });

  await db.insert(campaignTemplates).values({
    workspaceId,
    name: TEMPLATE_NAME,
    description: "Seeded for E2E template gallery tests",
    client: campaign.client,
    objective: campaign.objective,
    audience: campaign.audience,
    platforms: campaign.platforms ?? [],
    tone: campaign.tone,
    constraints: campaign.constraints,
    generationMode: campaign.generationMode,
    creativeLevel: campaign.creativeLevel,
    styleIntensity: campaign.styleIntensity,
  });

  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const seed = {
    email: DEV_EMAIL,
    password: process.env.TESTSPRITE_LOGIN_PASSWORD ?? "DevAdmin123!",
    workspaceId,
    campaignId: campaign.id,
    campaignName: CAMPAIGN_NAME,
    shareToken: SHARE_TOKEN,
    shareUrl: `${appUrl}/share/${SHARE_TOKEN}`,
    inviteToken: INVITE_TOKEN,
    inviteUrl: `${appUrl}/invite?token=${INVITE_TOKEN}`,
    fixtureBaseImage: fixtures.basePath,
    fixtureStyleImage: fixtures.stylePath,
    publicBaseImageUrl: `${appUrl}/e2e/base.png`,
    publicStyleImageUrl: `${appUrl}/e2e/style.png`,
    emptyUser,
    resetUser,
    resetTokenEndpoint: `${appUrl}/api/dev/reset-token?email=<email>`,
    e2eHint:
      "Start server with E2E_DISABLE_RATE_LIMIT=true. Use shareUrl and inviteUrl for token tests. " +
      "Uploads: fetch publicBaseImageUrl/publicStyleImageUrl bytes and feed them to file inputs via a Playwright buffer payload. " +
      "Empty-library test: log in with emptyUser. " +
      "Password reset: use resetUser; submit /forgot-password for that email, then GET resetTokenEndpoint to obtain resetPageUrl.",
  };

  fs.mkdirSync(path.dirname(SEED_JSON), { recursive: true });
  fs.writeFileSync(SEED_JSON, JSON.stringify(seed, null, 2));

  console.log("\nTestSprite seed ready:");
  console.log(JSON.stringify(seed, null, 2));
  console.log(`\nWrote ${SEED_JSON}`);
  console.log(
    "\nNext: E2E_DISABLE_RATE_LIMIT=true npm run start  (then re-run TestSprite)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

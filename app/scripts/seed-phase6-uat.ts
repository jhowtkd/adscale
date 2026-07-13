/**
 * Deterministic fixtures for Phase 6 Gate 6 UAT (S01–S14).
 *
 * Creates (dev-admin workspace only):
 *   - UAT campaign in reviewing (completed derivation) for continue + stages
 *   - UAT creative_work in ready+identity (canonical briefing) for post resume via ?workId=
 *   - UAT template for materialize (S10)
 *   - Client profile + brand kit for create-post paths
 *
 * Writes: app/tests/fixtures/phase6-uat.json
 *
 * Usage:
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/seed-phase6-uat.ts
 *   npm run seed:phase6-uat
 */
import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { and, eq, like } from "drizzle-orm";

import { db } from "../src/server/db";
import {
  campaignTemplates,
  campaigns,
  clientProfiles,
  creativeWorkItems,
  user,
  workspaceMembers,
} from "../src/server/db/schema";
import { createCampaign } from "../src/server/repositories/campaign";
import { createDerivation } from "../src/server/repositories/derivation";
import { createTemplate } from "../src/server/repositories/template";
import { createClientProfile } from "../src/server/repositories/client-reference";
import {
  createCreativeWork,
  setCreativeWorkCopy,
  confirmCreativeWorkIdentity,
} from "../src/server/repositories/creative-work";
import { createIdentitySnapshot } from "../src/server/creative-work/identity";
import { upsertBrandKit } from "../src/server/db/repositories/brand-kit";
import { createPlan } from "../src/server/repositories/plan";

const DEV_EMAIL = "dev-admin@adscale.local";
const PREFIX = "Phase6 UAT";
const FIXTURE_PATH = path.resolve(__dirname, "../tests/fixtures/phase6-uat.json");

async function resolveDevWorkspace() {
  const account = await db
    .select()
    .from(user)
    .where(eq(user.email, DEV_EMAIL))
    .limit(1);
  if (!account[0]) {
    throw new Error(
      `No user ${DEV_EMAIL}. Run npm run seed:dev-admin -- --create first.`
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

async function clearPrevious(workspaceId: string) {
  await db
    .delete(campaignTemplates)
    .where(
      and(
        eq(campaignTemplates.workspaceId, workspaceId),
        like(campaignTemplates.name, `${PREFIX}%`)
      )
    );

  const uatCampaigns = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.workspaceId, workspaceId),
        like(campaigns.name, `${PREFIX}%`)
      )
    );
  for (const c of uatCampaigns) {
    await db.delete(campaigns).where(eq(campaigns.id, c.id));
  }

  const profiles = await db
    .select({ id: clientProfiles.id })
    .from(clientProfiles)
    .where(
      and(
        eq(clientProfiles.workspaceId, workspaceId),
        like(clientProfiles.name, `${PREFIX}%`)
      )
    );
  for (const p of profiles) {
    await db
      .delete(creativeWorkItems)
      .where(eq(creativeWorkItems.clientProfileId, p.id));
    await db.delete(clientProfiles).where(eq(clientProfiles.id, p.id));
  }
}

async function ensureProfile(workspaceId: string, name: string) {
  const existing = await db
    .select()
    .from(clientProfiles)
    .where(
      and(
        eq(clientProfiles.workspaceId, workspaceId),
        eq(clientProfiles.name, name)
      )
    )
    .limit(1);
  if (existing[0]) return existing[0];
  return createClientProfile(workspaceId, { name });
}

async function main() {
  const { userId, workspaceId } = await resolveDevWorkspace();
  await clearPrevious(workspaceId);

  const profile = await ensureProfile(workspaceId, `${PREFIX} Brand`);
  // eslint-disable-next-line no-console
  console.log("[seed-phase6-uat] profile", profile.id, profile.name);
  await upsertBrandKit(
    workspaceId,
    {
      name: `${PREFIX} Brand`,
      description: "Phase 6 UAT seed brand",
      brandColors: ["#00C853", "#111111"],
      brandFonts: ["Inter"],
      toneOfVoice: "direto",
      prohibitedElements: "none",
      requiredElements: "logo",
    },
    profile.id
  );

  // Campaign for S04 continue + S06 stages (reviewing via completed derivation)
  const campaign = await createCampaign(workspaceId, {
    name: `${PREFIX} Campanha em revisao`,
    client: "UAT Client",
    clientProfileId: profile.id,
    objective: "Awareness",
    audience: "SMB marketers",
    product: "ADScale",
    platforms: ["meta_feed"],
    tone: "professional",
    generationMode: "art_variation",
    creativeLevel: "balanced",
    status: "active",
    creativeDiagnosisStatus: "ready",
  });
  await createPlan(campaign.id, workspaceId, {
    strategy: "UAT seed plan",
    angles: ["angle"],
    hooks: ["hook"],
    ctas: ["Saiba mais"],
  }).catch(() => undefined);

  const derivation = await createDerivation({
    campaignId: campaign.id,
    workspaceId,
    format: "1:1",
    generationMode: "art_variation",
    variantIndex: 0,
    status: "completed",
    creativeLevel: "balanced",
  });

  // Bump campaign so metrics project reviewing
  await db
    .update(campaigns)
    .set({
      status: "completed",
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaign.id));

  // Template for S10
  const template = await createTemplate({
    workspaceId,
    name: `${PREFIX} Template`,
    description: "Materialize target for Gate 6 S10",
    campaignId: campaign.id,
  });

  // Creative work post for S04 workId resume.
  // Canonical: generating requires ≥1 output row — use ready+identity (briefing) instead.
  const work = await createCreativeWork({
    workspaceId,
    clientProfileId: profile.id,
    createdByUserId: userId,
    toolKind: "social_post",
    format: "1:1",
    brief: {
      theme: "UAT post resume",
      objective: "engagement",
      audience: "testers",
      offer: "free trial",
    },
  });
  await setCreativeWorkCopy(workspaceId, work.id, {
    headline: "UAT headline",
    body: "UAT body copy for resume",
    cta: "Saiba mais",
  });

  const snap = await createIdentitySnapshot({
    workspaceId,
    clientProfileId: profile.id,
    selectedReferenceIds: [],
  });
  await confirmCreativeWorkIdentity(workspaceId, work.id, snap);

  // ready + identity → canonical "briefing" (valid, resumable, no ImpossibleCanonicalStateError)
  await db
    .update(creativeWorkItems)
    .set({
      status: "ready",
      updatedAt: new Date(Date.now() - 60_000),
    })
    .where(eq(creativeWorkItems.id, work.id));

  // Campaign is the freshest in-progress → Home "Continuar" prefers it
  await db
    .update(campaigns)
    .set({ updatedAt: new Date() })
    .where(eq(campaigns.id, campaign.id));

  // Second campaign slightly older for list density
  await createCampaign(workspaceId, {
    name: `${PREFIX} Campanha em briefing`,
    client: "UAT Client B",
    objective: "Leads",
    status: "draft",
  });

  const fixture = {
    email: DEV_EMAIL,
    password: "DevAdmin123!",
    workspaceId,
    userId,
    clientProfileId: profile.id,
    campaignId: campaign.id,
    campaignName: campaign.name,
    derivationId: derivation.id,
    templateId: template.id,
    templateName: template.name,
    workId: work.id,
    workResumeHref: `/quick-tools/create-post?workId=${work.id}`,
    emptySearch: "zzz-phase6-uat-empty-no-match",
    seededAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  // eslint-disable-next-line no-console
  console.log("[seed-phase6-uat]", fixture);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

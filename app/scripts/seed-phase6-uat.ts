/**
 * Deterministic fixtures for Phase 6 Gate 6 UAT (S01–S14).
 *
 * Creates (dev-admin workspace only):
 *   - UAT campaign in reviewing (completed derivation) for continue + stages
 *   - Preview OK / preview blocked campaigns for S07/S08 produceSurface
 *   - UAT creative_work in ready+identity for post resume / generate (S03/S04)
 *   - Completed creative_work with 3 outputs for S11 library save
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
  creativeWorkOutputs,
  derivations,
  user,
  workspaceMembers,
} from "../src/server/db/schema";
import { createCampaign } from "../src/server/repositories/campaign";
import { createDerivation } from "../src/server/repositories/derivation";
import { createAsset } from "../src/server/repositories/asset";
import { createTemplate } from "../src/server/repositories/template";
import { createClientProfile } from "../src/server/repositories/client-reference";
import {
  createCreativeWork,
  setCreativeWorkCopy,
  confirmCreativeWorkIdentity,
  createCreativeWorkOutputs,
  completeCreativeWorkOutput,
  setCreativeWorkStatus,
} from "../src/server/repositories/creative-work";
import { createIdentitySnapshot } from "../src/server/creative-work/identity";
import { upsertBrandKit } from "../src/server/db/repositories/brand-kit";
import { createPlan } from "../src/server/repositories/plan";
import { objectStorage } from "../src/server/storage";

/** 1×1 PNG so signed URLs resolve and the browser does not thrash on 404 loops. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function putUatPng(key: string) {
  await objectStorage.put(key, TINY_PNG, "image/png");
}

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

  // Second campaign slightly older for list density
  await createCampaign(workspaceId, {
    name: `${PREFIX} Campanha em briefing`,
    client: "UAT Client B",
    objective: "Leads",
    status: "draft",
  });

  // S07 — ready preview with acceptable quality (auto-continue produceSurface)
  const previewOkCampaign = await createCampaign(workspaceId, {
    name: `${PREFIX} Preview auto-ok`,
    client: "UAT Preview OK",
    clientProfileId: profile.id,
    objective: "Awareness",
    product: "ADScale",
    platforms: ["meta_feed"],
    generationMode: "art_variation",
    creativeLevel: "balanced",
    status: "active",
    creativeDiagnosisStatus: "ready",
    ctaVariants: ["Saiba mais"],
  });
  const previewOk = await createDerivation({
    campaignId: previewOkCampaign.id,
    workspaceId,
    format: "1:1",
    generationMode: "art_variation",
    variantIndex: 0,
    status: "completed",
    isPreview: true,
    creativeLevel: "balanced",
  });
  const previewOkKey = `uat/phase6/${previewOk.id}-preview-ok.png`;
  await putUatPng(previewOkKey);
  await db
    .update(derivations)
    .set({
      outputKey: previewOkKey,
      qualityVerdict: "acceptable",
      hardFailures: [],
      polishSuggestions: [],
      qualityGatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(derivations.id, previewOk.id));

  // S07 end-to-end path starts before preview generation. A real base asset
  // lets the UI queue the preview, Inngest complete it, and the acceptable
  // quality policy auto-queue the real batch.
  const previewFlowCampaign = await createCampaign(workspaceId, {
    name: `${PREFIX} Preview end-to-end`,
    client: "UAT Preview Flow",
    clientProfileId: profile.id,
    objective: "Awareness",
    product: "ADScale",
    platforms: ["meta_feed"],
    generationMode: "art_variation",
    creativeLevel: "balanced",
    status: "active",
    creativeDiagnosisStatus: "ready",
    ctaVariants: ["Saiba mais"],
  });
  await createPlan(previewFlowCampaign.id, workspaceId, {
    strategy: "UAT preview flow plan",
    angles: ["flow angle"],
    hooks: ["flow hook"],
    ctas: ["Saiba mais"],
  });
  const previewFlowBaseKey = `uat/phase6/${previewFlowCampaign.id}-base.png`;
  await putUatPng(previewFlowBaseKey);
  await createAsset(workspaceId, previewFlowCampaign.id, {
    key: previewFlowBaseKey,
    type: "image/png",
    size: TINY_PNG.length,
    width: 1,
    height: 1,
    role: "base",
  });
  // Keep the campaign in the production workspace state while leaving the
  // preview path untouched. A failed historical row is visible/retriable but
  // cannot satisfy S07's completed-batch assertion.
  await createDerivation({
    campaignId: previewFlowCampaign.id,
    workspaceId,
    format: "1:1",
    generationMode: "art_variation",
    variantIndex: 99,
    status: "failed",
    isPreview: false,
    creativeLevel: "balanced",
  });

  // S08 — ready preview blocked by quality gate (manual gate)
  const previewBadCampaign = await createCampaign(workspaceId, {
    name: `${PREFIX} Preview gate-block`,
    client: "UAT Preview Block",
    clientProfileId: profile.id,
    objective: "Awareness",
    product: "ADScale",
    platforms: ["meta_feed"],
    generationMode: "art_variation",
    creativeLevel: "balanced",
    status: "active",
    creativeDiagnosisStatus: "ready",
    ctaVariants: ["Saiba mais"],
  });
  await createPlan(previewBadCampaign.id, workspaceId, {
    strategy: "UAT manual preview gate plan",
    angles: ["manual gate angle"],
    hooks: ["manual gate hook"],
    ctas: ["Saiba mais"],
  });
  const previewBadBaseKey = `uat/phase6/${previewBadCampaign.id}-base.png`;
  await putUatPng(previewBadBaseKey);
  await createAsset(workspaceId, previewBadCampaign.id, {
    key: previewBadBaseKey,
    type: "image/png",
    size: TINY_PNG.length,
    width: 1,
    height: 1,
    role: "base",
  });
  const previewBad = await createDerivation({
    campaignId: previewBadCampaign.id,
    workspaceId,
    format: "1:1",
    generationMode: "art_variation",
    variantIndex: 0,
    status: "completed",
    isPreview: true,
    creativeLevel: "balanced",
  });
  const previewBadKey = `uat/phase6/${previewBad.id}-preview-bad.png`;
  await putUatPng(previewBadKey);
  await db
    .update(derivations)
    .set({
      outputKey: previewBadKey,
      qualityVerdict: "invalid",
      hardFailures: [
        {
          code: "cta_drift",
          message: "Phase6 UAT forced quality hard failure (cta_drift)",
        },
      ],
      polishSuggestions: ["Ajustar contraste"],
      qualityGatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(derivations.id, previewBad.id));

  // S11 — creative work with three completed outputs (library-save target).
  // Real OpenAI gen is exercised in S03 when Inngest is up; this fixture
  // keeps library path deterministic when provider is slow.
  const libraryWork = await createCreativeWork({
    workspaceId,
    clientProfileId: profile.id,
    createdByUserId: userId,
    toolKind: "social_post",
    format: "1:1",
    brief: {
      theme: "UAT library save",
      objective: "engagement",
      audience: "testers",
      offer: "demo",
    },
  });
  await setCreativeWorkCopy(workspaceId, libraryWork.id, {
    headline: "UAT library headline",
    body: "UAT library body",
    cta: "Saiba mais",
  });
  const librarySnap = await createIdentitySnapshot({
    workspaceId,
    clientProfileId: profile.id,
    selectedReferenceIds: [],
  });
  await confirmCreativeWorkIdentity(workspaceId, libraryWork.id, librarySnap);
  const libraryOutputs = await createCreativeWorkOutputs(
    workspaceId,
    libraryWork.id
  );
  for (const [i, out] of libraryOutputs.entries()) {
    const key = `uat/phase6/${libraryWork.id}-out-${i}.png`;
    await putUatPng(key);
    await completeCreativeWorkOutput(workspaceId, libraryWork.id, out.id, {
      outputKey: key,
      cost: 0,
      quality: { verdict: "acceptable" },
    });
  }
  await setCreativeWorkStatus(workspaceId, libraryWork.id, "completed");
  // ensure selected not set yet — UI selects + saveToLibrary
  await db
    .update(creativeWorkOutputs)
    .set({ isSelected: false })
    .where(eq(creativeWorkOutputs.workItemId, libraryWork.id));

  // Primary continue campaign is freshest in-progress
  await db
    .update(campaigns)
    .set({ updatedAt: new Date() })
    .where(eq(campaigns.id, campaign.id));

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
    previewOkCampaignId: previewOkCampaign.id,
    previewOkDerivationId: previewOk.id,
    previewFlowCampaignId: previewFlowCampaign.id,
    previewBadCampaignId: previewBadCampaign.id,
    previewBadDerivationId: previewBad.id,
    libraryWorkId: libraryWork.id,
    libraryOutputId: libraryOutputs[0]?.id ?? "",
    libraryWorkHref: `/quick-tools/create-post?workId=${libraryWork.id}`,
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

import "./load-env";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { db } from "../src/server/db";
import { campaigns, clientProfiles, creativeWorkItems, derivations, user, workspaceAssets, workspaceMembers, workspaces } from "../src/server/db/schema";
import { createCampaign } from "../src/server/repositories/campaign";
import { upsertBrandKit } from "../src/server/repositories/brand-kit";
import { createClientProfile } from "../src/server/repositories/client-reference";
import { createCreativeWorkDraft, createCreativeWorkSource } from "../src/server/repositories/creative-work";
import {
  getActiveTesterEntitlementByWorkspace,
  grantTesterEntitlement,
  revokeTesterEntitlement,
} from "../src/server/repositories/entitlements";
import { createWorkspaceAsset } from "../src/server/repositories/workspace-asset";
import { createDefaultCreativeDirectionPool } from "../src/server/creative-work/contracts";
import { objectStorage } from "../src/server/storage";

const EMAIL = "visual-foundations@example.test";
const NAME = "Visual Foundations Tester";
const WORKSPACE_NAME = "Example Test Creative Lab";
const CAMPAIGN_PREFIX = "VF Example";
const PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";
const BASE_URL = (process.env.E2E_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MANIFEST_PATH = path.resolve(process.cwd(), "test-results/visual-foundations/manifest.json");
const VARIATION_DRAFT_KEY = "00000000-0000-4000-8000-000000000167";
const VARIATION_SOURCES = [
  { name: "vf-variation-horizontal-320x180.svg", width: 320, height: 180, color: "#00b34a", label: "Horizontal" },
  { name: "vf-variation-square-240x240.svg", width: 240, height: 240, color: "#0f766e", label: "Square" },
  { name: "vf-variation-vertical-180x320.svg", width: 180, height: 320, color: "#7c3aed", label: "Vertical" },
] as const;

function variationSourceSvg({ width, height, color, label }: (typeof VARIATION_SOURCES)[number]) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#172018"/><rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="${color}"/><text x="${width / 2}" y="${height / 2}" fill="white" font-family="Arial" font-size="20" text-anchor="middle">${label}</text></svg>`);
}

async function ensureAccount() {
  const existing = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);
  if (!existing[0]) {
    const response = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Referer: `${BASE_URL}/signup`,
      },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: NAME }),
    });
    if (!response.ok) throw new Error(`Synthetic sign-up failed (${response.status}): ${await response.text()}`);
  }

  const rows = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1);
  if (!rows[0]) throw new Error(`Synthetic account ${EMAIL} was not created`);
  await db.update(user).set({
    name: NAME,
    emailVerified: true,
    onboardingCompletedAt: new Date("2026-01-01T12:00:00.000Z"),
    locale: "pt-BR",
    updatedAt: new Date(),
  }).where(eq(user.id, rows[0].id));
  return rows[0].id;
}

async function main() {
  const userId = await ensureAccount();
  const membership = await db.select().from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId)).limit(1);
  if (!membership[0]) throw new Error("Synthetic account has no workspace membership");

  const workspaceId = membership[0].workspaceId;

  if (process.argv.includes("--revoke-access")) {
    await revokeTesterEntitlement(workspaceId);
    if (await getActiveTesterEntitlementByWorkspace(workspaceId)) {
      throw new Error("Synthetic tester access was not revoked");
    }
    console.log("Visual foundations tester access revoked.");
    return;
  }

  await grantTesterEntitlement({
    workspaceId,
    grantedByUserId: userId,
    grantedByEmail: EMAIL,
    notes: "Local visual foundations harness",
  });
  await db.update(workspaces).set({ name: WORKSPACE_NAME, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  await db.delete(clientProfiles).where(and(
    eq(clientProfiles.workspaceId, workspaceId),
    or(
      like(clientProfiles.name, "VF Example Brand%"),
      eq(clientProfiles.name, "Example Test Brand Kit"),
    ),
  ));
  const fixtureProfile = await createClientProfile(workspaceId, {
    name: "VF Example Brand",
    description: "Synthetic example.test onboarding fixture",
  });
  await upsertBrandKit(workspaceId, {
    name: "VF Example Brand Kit",
    description: "Synthetic example.test visual fixture",
    brandColors: ["#00B34A", "#172018"],
    brandFonts: ["Inter"],
  }, fixtureProfile.id);
  await db.delete(campaigns).where(and(
    eq(campaigns.workspaceId, workspaceId),
    like(campaigns.name, `${CAMPAIGN_PREFIX}%`),
  ));

  const fixtures = [
    {
      name: `${CAMPAIGN_PREFIX} — Lançamento internacional com título deliberadamente longo`,
      client: "Example Test Client Alpha",
      objective: "Validar hierarquia visual e conversão em telas densas",
      audience: "Equipes de marketing distribuídas entre Brasil e Estados Unidos",
      platforms: ["Instagram", "Facebook", "LinkedIn"],
      tone: "Profissional e direto",
      offer: "Avaliação sintética sem dados de clientes",
      status: "active",
    },
    {
      name: `${CAMPAIGN_PREFIX} — English performance experiment with intentionally verbose copy`,
      client: "Example Test Client Beta",
      objective: "Exercise dense campaign rows and responsive actions",
      audience: "Synthetic growth teams evaluating creative operations",
      platforms: ["TikTok", "YouTube"],
      tone: "Clear and analytical",
      offer: "Synthetic example.test fixture",
      status: "draft",
    },
    {
      name: `${CAMPAIGN_PREFIX} — Campanha sazonal arquivada`,
      client: "Example Test Client Gamma",
      objective: "Representar estados arquivados",
      audience: "Público exclusivamente sintético",
      platforms: ["Instagram"],
      tone: "Conciso",
      offer: "Nenhuma oferta real",
      status: "archived",
    },
  ] as const;

  const created = [];
  for (const fixture of fixtures) {
    created.push(await createCampaign(workspaceId, {
      ...fixture,
      constraints: "Never display production identity, tokens, or customer data.",
    }));
  }
  const [derivation] = await db.insert(derivations).values({
    campaignId: created[0].id,
    workspaceId,
    status: "completed",
    prompt: "Synthetic example.test derivation for visual review",
    format: "1:1",
    generationMode: "art_variation",
    variantIndex: 0,
    ctaText: "Synthetic CTA",
    scoreStatus: "analyzed",
    qaStatus: "passed",
  }).returning();
  await db.delete(creativeWorkItems).where(and(
    eq(creativeWorkItems.workspaceId, workspaceId),
    eq(creativeWorkItems.draftKey, VARIATION_DRAFT_KEY),
  ));
  await db.delete(workspaceAssets).where(and(
    eq(workspaceAssets.workspaceId, workspaceId),
    inArray(workspaceAssets.name, VARIATION_SOURCES.map(({ name }) => name)),
  ));
  const variationAssets = [];
  for (const fixture of VARIATION_SOURCES) {
    const source = variationSourceSvg(fixture);
    const key = `e2e/visual-foundations/${workspaceId.slice(0, 8)}/${fixture.name}`;
    await objectStorage.put(key, source, "image/svg+xml");
    variationAssets.push(await createWorkspaceAsset({
      workspaceId,
      key,
      name: fixture.name,
      type: "image/svg+xml",
      size: source.byteLength,
      width: fixture.width,
      height: fixture.height,
    }));
  }
  const variationDirections = createDefaultCreativeDirectionPool();
  variationDirections.directions = variationDirections.directions.map((direction) => ({
    ...direction,
    provenance: "ai-suggestion",
  }));
  const variationWork = await createCreativeWorkDraft({
    workspaceId,
    clientProfileId: fixtureProfile.id,
    createdByUserId: userId,
    draftKey: VARIATION_DRAFT_KEY,
    intent: "variations",
    title: "VF visual variations fixture",
    request: "Variações visuais sem geração.",
    campaignId: created[0].id,
    format: "4:5",
    settings: { targetFormats: [], formatMode: "manual", directionPool: variationDirections },
  });
  if (!variationWork) throw new Error("Could not create visual variations fixture");
  for (const [index, asset] of variationAssets.entries()) {
    const fixture = VARIATION_SOURCES[index];
    const variationSource = await createCreativeWorkSource({
      workspaceId,
      workItemId: variationWork.id,
      assetId: asset.id,
      usage: "both",
      usageConfirmed: true,
      status: "ready",
      contentAnalysis: {
        summaryPt: "Fixture visual de variações",
        literalText: fixture.label,
        entities: [fixture.label],
        product: "Fixture visual",
        offer: "Sem oferta",
        cta: { text: "Saiba mais", style: "botão" },
        brandElements: ["ADScale"],
        keyVisual: "Bloco colorido",
        textContent: { headline: fixture.label, bullets: [] },
        format: `${fixture.width}:${fixture.height}`,
      },
      styleAnalysis: {
        palette: [{ hex: fixture.color, labelPt: "cor da fixture" }],
        colorPalette: { dominant: [fixture.color], accents: ["#172018"], gradients: "none" },
        typography: { personality: "Direta", effects: [] },
        textures: [],
        composition: fixture.label,
        mood: "Clara",
        decorativeElements: [],
        photoTreatment: "Gráfico",
      },
    });
    if (!variationSource) throw new Error(`Could not create ${fixture.name}`);
  }

  const routes = {
    creativeWork: "/",
    dashboard: "/dashboard",
    campaignList: "/campaigns",
    library: "/library",
    onboarding: "/brand-kit",
    workspace: `/campaigns/${created[0].id}`,
    variationWorkspace: `/?workId=${variationWork.id}&intent=variations`,
    settingsProfile: "/settings?tab=profile",
    settingsBilling: "/settings?tab=billing",
  };
  const states = {
    dashboard: ["populated", "empty", "loading", "error"],
    campaignList: ["dense", "empty", "loading", "error"],
    workspace: ["populated", "loading", "error"],
    settings: ["profile", "billing", "validation-error"],
  };

  const manifest = {
    schemaVersion: 2,
    identity: { email: EMAIL, name: NAME },
    fixtureIds: { userId, workspaceId, campaignIds: created.map((campaign) => campaign.id), derivationId: derivation.id },
    labels: { workspace: WORKSPACE_NAME, clients: fixtures.map((fixture) => fixture.client) },
    variationSources: VARIATION_SOURCES.map(({ name, width, height }) => ({ name, width, height })),
    routes,
    states,
  };
  mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Visual foundations seed ready: ${MANIFEST_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import "./load-env";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq, like } from "drizzle-orm";
import { db } from "../src/server/db";
import { campaigns, user, workspaceMembers, workspaces } from "../src/server/db/schema";
import { createCampaign } from "../src/server/repositories/campaign";

const EMAIL = "visual-foundations@example.test";
const NAME = "Visual Foundations Tester";
const WORKSPACE_NAME = "Example Test Creative Lab";
const CAMPAIGN_PREFIX = "VF Example";
const PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";
const BASE_URL = (process.env.E2E_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MANIFEST_PATH = path.resolve(process.cwd(), "test-results/visual-foundations/manifest.json");

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
  await db.update(workspaces).set({ name: WORKSPACE_NAME, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
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

  const routes = {
    dashboard: "/",
    campaignList: "/campaigns",
    workspace: `/campaigns/${created[0].id}`,
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
    schemaVersion: 1,
    identity: { email: EMAIL, name: NAME },
    fixtureIds: { userId, workspaceId, campaignIds: created.map((campaign) => campaign.id) },
    labels: { workspace: WORKSPACE_NAME, clients: fixtures.map((fixture) => fixture.client) },
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

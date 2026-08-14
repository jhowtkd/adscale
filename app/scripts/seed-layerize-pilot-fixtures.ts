/**
 * Creates three deterministic synthetic Layerize pilot inputs. It never calls
 * Inngest, fal, billing, or credits.
 *
 * Required safeguards:
 *   LAYERIZE_PILOT_FIXTURE_MODE=isolated|production-authorized
 *   LAYERIZE_PILOT_DATABASE_HOST=<the isolated DB hostname>
 *   LAYERIZE_PILOT_BUCKET=<the isolated R2 bucket>
 *   LAYERIZE_PILOT_WORKSPACE_ID=<dedicated workspace UUID>
 *   LAYERIZE_PILOT_OWNER_EMAIL=<owner already present in that workspace>
 *
 * Usage:
 *   npx tsx scripts/seed-layerize-pilot-fixtures.ts
 */
import "./load-env";

import { and, eq } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../src/server/db";
import {
  clientProfiles,
  creativeWorkItems,
  user,
  workspaceMembers,
} from "../src/server/db/schema";
import { createClientProfile } from "../src/server/repositories/client-reference";
import {
  completeCreativeWorkOutput,
  confirmCreativeWorkIdentity,
  createCreativeWork,
  createPlannedCreativeWorkOutputs,
  markCreativeWorkOutputProcessing,
  selectCreativeWorkOutput,
  setCreativeWorkCopy,
  setCreativeWorkStatus,
} from "../src/server/repositories/creative-work";
import { ensureCreativeWorkOutputInLibrary } from "../src/server/application/ensure-creative-work-output-library";
import { createIdentitySnapshot } from "../src/server/creative-work/identity";
import type { CreativeWorkFormat } from "../src/server/creative-work/contracts";
import { env } from "../src/server/validation/env";
import { objectStorage } from "../src/server/storage";

const PREFIX = "Seedream Layerize Synthetic Pilot";
const PRODUCTION_HOSTS = new Set([
  "adscale.jhonatansoares.com",
  "adscale-app.onrender.com",
]);
const FORMATS: Array<{ format: CreativeWorkFormat; width: number; height: number; accent: string }> = [
  { format: "1:1", width: 1024, height: 1024, accent: "#2DD4BF" },
  { format: "4:5", width: 1024, height: 1280, accent: "#F59E0B" },
  { format: "9:16", width: 1080, height: 1920, accent: "#A78BFA" },
];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the isolated fixture seed`);
  return value;
}

function assertTargetEnvironment(): { mode: "isolated" | "production-authorized"; workspaceId: string; ownerEmail: string } {
  const mode = process.env.LAYERIZE_PILOT_FIXTURE_MODE;
  if (mode !== "isolated" && mode !== "production-authorized") {
    throw new Error("Refusing to seed: set LAYERIZE_PILOT_FIXTURE_MODE explicitly");
  }
  if (env.FAL_KEY?.trim()) {
    throw new Error("Refusing to seed while FAL_KEY is configured");
  }

  const appHost = new URL(env.APP_URL).hostname;
  if (mode === "isolated" && PRODUCTION_HOSTS.has(appHost)) {
    throw new Error(`Refusing to seed production host ${appHost}`);
  }
  if (mode === "production-authorized") {
    if (!PRODUCTION_HOSTS.has(appHost)) {
      throw new Error(`Refusing production-authorized mode for host ${appHost}`);
    }
    if (process.env.LAYERIZE_PILOT_PRODUCTION_APPROVAL !== "user-authorized-2026-08-14") {
      throw new Error("Refusing production seed without the explicit approval marker");
    }
  }

  const databaseHost = new URL(env.DATABASE_URL).hostname;
  if (mode === "isolated" && databaseHost !== requiredEnv("LAYERIZE_PILOT_DATABASE_HOST")) {
    throw new Error(`Refusing to seed unexpected database host ${databaseHost}`);
  }
  if (mode === "isolated" && env.R2_BUCKET !== requiredEnv("LAYERIZE_PILOT_BUCKET")) {
    throw new Error("Refusing to seed an unapproved R2 bucket");
  }

  const workspaceId = requiredEnv("LAYERIZE_PILOT_WORKSPACE_ID");
  const ownerEmail = requiredEnv("LAYERIZE_PILOT_OWNER_EMAIL").toLowerCase();
  const ownerEmails = new Set(
    (process.env.PLATFORM_OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!ownerEmails.has(ownerEmail)) {
    throw new Error(`${ownerEmail} is not listed in PLATFORM_OWNER_EMAILS`);
  }
  return { mode, workspaceId, ownerEmail };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

async function buildSyntheticPng(input: {
  format: CreativeWorkFormat;
  width: number;
  height: number;
  accent: string;
}): Promise<Buffer> {
  const label = escapeXml(`ADScale SYNTHETIC ${input.format}`);
  const cardWidth = Math.round(input.width * 0.76);
  const cardHeight = Math.round(input.height * 0.28);
  const cardX = Math.round((input.width - cardWidth) / 2);
  const cardY = Math.round(input.height * 0.36);
  const radius = Math.max(28, Math.round(input.width * 0.035));
  const circle = Math.round(input.width * 0.08);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}">
      <rect width="100%" height="100%" fill="#111827"/>
      <rect x="${cardX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="${radius}" fill="#F9FAFB"/>
      <circle cx="${Math.round(input.width * 0.16)}" cy="${Math.round(input.height * 0.16)}" r="${circle}" fill="${input.accent}"/>
      <rect x="${cardX + Math.round(cardWidth * 0.08)}" y="${cardY + Math.round(cardHeight * 0.22)}" width="${Math.round(cardWidth * 0.22)}" height="${Math.max(14, Math.round(cardHeight * 0.08))}" rx="8" fill="${input.accent}"/>
      <rect x="${cardX + Math.round(cardWidth * 0.08)}" y="${cardY + Math.round(cardHeight * 0.48)}" width="${Math.round(cardWidth * 0.66)}" height="${Math.max(18, Math.round(cardHeight * 0.1))}" rx="8" fill="#111827"/>
      <rect x="${cardX + Math.round(cardWidth * 0.08)}" y="${cardY + Math.round(cardHeight * 0.68)}" width="${Math.round(cardWidth * 0.48)}" height="${Math.max(12, Math.round(cardHeight * 0.06))}" rx="6" fill="#9CA3AF"/>
      <text x="${Math.round(input.width * 0.08)}" y="${Math.round(input.height * 0.88)}" fill="#F9FAFB" font-family="Arial, sans-serif" font-size="${Math.max(22, Math.round(input.width * 0.035))}" font-weight="700">${label}</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function resolveOwner(input: { workspaceId: string; ownerEmail: string }) {
  const [account] = await db.select().from(user).where(eq(user.email, input.ownerEmail)).limit(1);
  if (!account) throw new Error(`Owner ${input.ownerEmail} was not found`);
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, account.id)))
    .limit(1);
  if (!membership) throw new Error("Owner is not a member of the pilot workspace");
  return account;
}

async function ensureProfile(workspaceId: string) {
  const [existing] = await db
    .select()
    .from(clientProfiles)
    .where(and(eq(clientProfiles.workspaceId, workspaceId), eq(clientProfiles.name, PREFIX)))
    .limit(1);
  return existing ?? createClientProfile(workspaceId, { name: PREFIX });
}

async function seedFormat(input: {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  format: CreativeWorkFormat;
  width: number;
  height: number;
  accent: string;
}) {
  const title = `${PREFIX} ${input.format}`;
  const [existing] = await db
    .select()
    .from(creativeWorkItems)
    .where(and(
      eq(creativeWorkItems.workspaceId, input.workspaceId),
      eq(creativeWorkItems.clientProfileId, input.clientProfileId),
      eq(creativeWorkItems.title, title),
    ))
    .limit(1);
  if (existing) {
    throw new Error(`Fixture already exists for ${input.format}; refusing to mutate it: ${existing.id}`);
  }

  const work = await createCreativeWork({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    createdByUserId: input.userId,
    toolKind: "social_post",
    format: input.format,
    brief: {
      theme: title,
      objective: "Synthetic Layerize pilot fixture",
      audience: "Internal QA only",
      offer: "No commercial offer; synthetic asset",
    },
  });
  await setCreativeWorkCopy(input.workspaceId, work.id, {
    headline: `Synthetic ${input.format} Layerize fixture`,
    body: "ADScale-owned deterministic test artwork. Not a client asset.",
    cta: "Internal QA",
  });
  const snapshot = await createIdentitySnapshot({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    selectedReferenceIds: [],
  });
  await confirmCreativeWorkIdentity(input.workspaceId, work.id, snapshot);

  const { outputs } = await createPlannedCreativeWorkOutputs(input.workspaceId, work.id, [{
    creativeLevel: "balanced",
    targetFormat: input.format,
    versionNumber: 1,
  }]);
  const [output] = outputs;
  if (!output) throw new Error(`Could not create output for ${input.format}`);

  const key = `synthetic/layerize-pilot/${work.id}/${input.format.replace(":", "x")}.png`;
  const png = await buildSyntheticPng(input);
  await objectStorage.put(key, png, "image/png");
  const processing = await markCreativeWorkOutputProcessing(input.workspaceId, work.id, output.id);
  if (!processing) throw new Error(`Could not claim output for ${input.format}`);
  await ensureCreativeWorkOutputInLibrary({
    workspaceId: input.workspaceId,
    outputKey: key,
    theme: title,
    creativeLevel: output.creativeLevel,
  });
  const completed = await completeCreativeWorkOutput(input.workspaceId, work.id, output.id, {
    outputKey: key,
    cost: 0,
    quality: {
      schemaVersion: 1,
      objectiveVerdict: "pass",
      evaluatorSummary: "Deterministic synthetic fixture; not provider output.",
      provenance: "synthetic",
      fixture: true,
    },
  });
  if (!completed) throw new Error(`Could not complete output for ${input.format}`);
  const selected = await selectCreativeWorkOutput(input.workspaceId, work.id, output.id, { confirmObjective: true });
  if (!selected?.isSelected) throw new Error(`Could not select output for ${input.format}`);
  await setCreativeWorkStatus(input.workspaceId, work.id, "completed");

  return {
    format: input.format,
    workItemId: work.id,
    outputId: output.id,
    outputKey: key,
    width: input.width,
    height: input.height,
    provenance: "synthetic",
  };
}

async function main() {
  const target = assertTargetEnvironment();
  const account = await resolveOwner(target);
  const profile = await ensureProfile(target.workspaceId);
  const candidates = await Promise.all(FORMATS.map((format) => seedFormat({
    workspaceId: target.workspaceId,
    userId: account.id,
    clientProfileId: profile.id,
    ...format,
  })));

  console.log(JSON.stringify({
    mode: target.mode,
    candidates,
    next: "Human-review provenance before any FAL_KEY configuration or paid smoke.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

/**
 * Idempotent Cenbrap Olhar voice config seed for Phase 162.
 *
 * Upserts approved voice configuration from CENBRAP_VOICE for every
 * client_profiles row whose name matches `%cenbrap%` (case-insensitive).
 *
 * Default is dry-run (no writes). Pass --confirm to apply changes.
 *
 * Usage:
 *   npx tsx scripts/seed-cenbrap-voice-config.ts
 *   npx tsx scripts/seed-cenbrap-voice-config.ts --confirm
 *   npx tsx scripts/seed-cenbrap-voice-config.ts --confirm --workspace-id=<uuid>
 */
import "./load-env";

import { and, eq, ilike } from "drizzle-orm";

import { CENBRAP_VOICE } from "@/server/ai/voices/cenbrap";
import { db } from "@/server/db";
import { clientProfiles } from "@/server/db/schema";
import { upsertOlharVoiceConfig } from "@/server/repositories/client-profile-olhar-config";

interface CliOptions {
  confirm: boolean;
  workspaceId?: string;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/seed-cenbrap-voice-config.ts [options]",
    "",
    "Options:",
    "  --dry-run            Preview changes without writing (default)",
    "  --confirm            Apply database writes",
    "  --workspace-id <id>  Limit seed to a single workspace UUID",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  const workspaceIdIndex = argv.indexOf("--workspace-id");
  const workspaceId =
    workspaceIdIndex >= 0 ? argv[workspaceIdIndex + 1]?.trim() : undefined;

  if (workspaceIdIndex >= 0 && !workspaceId) {
    throw new Error("--workspace-id requires a UUID value");
  }

  return {
    confirm: argv.includes("--confirm"),
    workspaceId,
  };
}

function buildConfigFromCenbrapVoice() {
  return {
    principles: CENBRAP_VOICE.principles,
    positiveSignals: CENBRAP_VOICE.positiveSignals,
    negativeSignals: CENBRAP_VOICE.negativeSignals,
    authorityAndClaims: CENBRAP_VOICE.authorityAndClaims,
    inviteRhythm: CENBRAP_VOICE.inviteRhythm,
    correctButSoulless: CENBRAP_VOICE.correctButSoulless,
    matchTerms: CENBRAP_VOICE.matchTerms,
  };
}

async function findCenbrapProfiles(workspaceId?: string) {
  const conditions = [ilike(clientProfiles.name, "%cenbrap%")];

  if (workspaceId) {
    conditions.push(eq(clientProfiles.workspaceId, workspaceId));
  }

  return db
    .select({
      id: clientProfiles.id,
      workspaceId: clientProfiles.workspaceId,
      name: clientProfiles.name,
    })
    .from(clientProfiles)
    .where(and(...conditions));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const profiles = await findCenbrapProfiles(options.workspaceId);

  if (profiles.length === 0) {
    console.log("No Cenbrap client profiles found — nothing to seed.");
    return;
  }

  const config = buildConfigFromCenbrapVoice();
  const approvedAt = new Date();

  console.log(
    `Found ${profiles.length} Cenbrap profile(s)${options.workspaceId ? ` in workspace ${options.workspaceId}` : ""}.`
  );

  for (const profile of profiles) {
    const summary = {
      clientProfileId: profile.id,
      workspaceId: profile.workspaceId,
      profileName: profile.name,
      voiceId: CENBRAP_VOICE.id,
      reviewStatus: "approved",
      source: "seeded",
    };

    if (!options.confirm) {
      console.log("[dry-run] Would upsert olhar voice config:", summary);
      continue;
    }

    await upsertOlharVoiceConfig({
      workspaceId: profile.workspaceId,
      clientProfileId: profile.id,
      voiceId: CENBRAP_VOICE.id,
      displayName: CENBRAP_VOICE.displayName,
      config,
      reviewStatus: "approved",
      source: "seeded",
      approvedAt,
    });

    console.log("Seeded olhar voice config:", summary);
  }

  if (!options.confirm) {
    console.log("Dry-run mode — pass --confirm to write voice config rows.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Read-only voice coverage audit (plan Fase 6).
 *
 * Quantifies the production impact of the "no global voice fallback" decision
 * (Q9-A): how many client profiles currently have an approved voice config
 * (and thus receive voice conditioning) versus how many do not (and will stop
 * receiving voice once any latent fallback is removed). The decision to ship
 * rests on whether the unvoiced count is acceptable.
 *
 * This script NEVER writes — it only queries and reports. It is the data input
 * for the Q12 "informed decision" milestone.
 *
 * Usage:
 *   npx tsx scripts/audit-voice-coverage.ts
 *   npx tsx scripts/audit-voice-coverage.ts --workspace-id=<uuid>
 *   npx tsx scripts/audit-voice-coverage.ts --json
 */
import "./load-env";

import { and, count, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  clientProfileOlharConfig,
  clientProfiles,
} from "@/server/db/schema";

interface CliOptions {
  workspaceId?: string;
  json: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Usage: npx tsx scripts/audit-voice-coverage.ts [options]",
        "",
        "Options:",
        "  --workspace-id <id>  Limit audit to a single workspace UUID",
        "  --json               Emit machine-readable JSON instead of a report",
      ].join("\n"),
    );
    process.exit(0);
  }

  const workspaceIdIndex = argv.indexOf("--workspace-id");
  const workspaceId =
    workspaceIdIndex >= 0 ? argv[workspaceIdIndex + 1]?.trim() : undefined;

  return {
    workspaceId,
    json: argv.includes("--json"),
  };
}

async function totalProfiles(workspaceId?: string) {
  const conditions = workspaceId
    ? [eq(clientProfiles.workspaceId, workspaceId)]
    : [];
  const [row] = await db
    .select({ value: count() })
    .from(clientProfiles)
    .where(conditions.length ? and(...conditions) : undefined);
  return Number(row?.value ?? 0);
}

async function approvedVoiceProfiles(workspaceId?: string) {
  const conditions = [
    eq(clientProfileOlharConfig.reviewStatus, "approved"),
    ...(workspaceId
      ? [eq(clientProfileOlharConfig.workspaceId, workspaceId)]
      : []),
  ];
  const [row] = await db
    .select({ value: count() })
    .from(clientProfileOlharConfig)
    .where(and(...conditions));
  return Number(row?.value ?? 0);
}

async function anyVoiceProfiles(workspaceId?: string) {
  const conditions = workspaceId
    ? [eq(clientProfileOlharConfig.workspaceId, workspaceId)]
    : [];
  const [row] = await db
    .select({ value: count() })
    .from(clientProfileOlharConfig)
    .where(conditions.length ? and(...conditions) : undefined);
  return Number(row?.value ?? 0);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const [total, approved, anyVoice] = await Promise.all([
    totalProfiles(options.workspaceId),
    approvedVoiceProfiles(options.workspaceId),
    anyVoiceProfiles(options.workspaceId),
  ]);

  const unvoiced = total - anyVoice;
  const pendingOrChanges = anyVoice - approved;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          scope: options.workspaceId ?? "all-workspaces",
          totalProfiles: total,
          withApprovedVoice: approved,
          withAnyVoice: anyVoice,
          pendingOrChangesRequested: pendingOrChanges,
          withoutVoice: unvoiced,
        },
        null,
        2,
      ),
    );
    return;
  }

  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(1) : "0.0");
  console.log(`\nVoice coverage audit — ${options.workspaceId ?? "all workspaces"}`);
  console.log("─".repeat(54));
  console.log(`Total client profiles:     ${total}`);
  console.log(`With approved voice:       ${approved} (${pct(approved)}%)`);
  console.log(`With any voice row:        ${anyVoice} (${pct(anyVoice)}%)`);
  console.log(`  └ pending / changes req: ${pendingOrChanges}`);
  console.log(`Without any voice:         ${unvoiced} (${pct(unvoiced)}%)`);
  console.log("─".repeat(54));
  console.log(
    "Profiles 'without any voice' will NOT receive voice conditioning in\n" +
      "generation — they will rely on the wizard to train a voice explicitly.\n" +
      "This number is the production impact of removing the global fallback.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Voice coverage audit failed:", error);
    process.exit(1);
  });

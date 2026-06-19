/**
 * Idempotent Cenbrap calibration corpus for Phase 144.
 *
 * Default is dry-run (no writes). Pass --confirm to apply changes.
 *
 * Usage:
 *   npx tsx scripts/seed-cenbrap-calibration-corpus.ts              # dry-run
 *   npx tsx scripts/seed-cenbrap-calibration-corpus.ts --inspect-only
 *   npx tsx scripts/seed-cenbrap-calibration-corpus.ts --confirm
 *   npx tsx scripts/seed-cenbrap-calibration-corpus.ts --confirm --workspace-email=dev@adscale.local
 */
import "./load-env";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, like } from "drizzle-orm";
import type {
  ExportStatusPayload,
  OlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";
import { db } from "@/server/db";
import { campaigns, derivations, user, workspaceMembers, workspaces } from "@/server/db/schema";
import { matchCenbrapCampaign } from "@/server/olhar-calibration/cenbrap-calibration";
import { createCampaign } from "@/server/repositories/campaign";
import {
  createDerivation,
  updateDerivationDualVerdict,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { getClientProfiles } from "@/server/repositories/client-reference";
import { getCampaigns } from "@/server/repositories/campaign";
import { getDerivationsByCampaign } from "@/server/repositories/derivation";
import { objectStorage } from "@/server/storage";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const PHASE_DIR = path.join(
  REPO_ROOT,
  ".planning/phases/144-cenbrap-corpus-seeding-and-calibration-rerun"
);
const MANIFEST_PATH = path.join(PHASE_DIR, "144-CORPUS-MANIFEST.json");
const PHASE_148_DIR = path.join(
  REPO_ROOT,
  ".planning/phases/148-sample-sufficiency-expansion"
);
const PHASE_148_MANIFEST_PATH = path.join(PHASE_148_DIR, "148-SAMPLE-MANIFEST.json");

export const CAMPAIGN_PREFIX = "Cenbrap Calibration —";
export const SEED_MARKER = "phase144_cenbrap_calibration_corpus";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

type CorpusSourceLabel = "real_customer" | "operator_imported" | "synthetic_fixture";

interface CliOptions {
  confirm: boolean;
  inspectOnly: boolean;
  expandOnly: boolean;
  manifestPath: string;
  workspaceId?: string;
  workspaceEmail?: string;
}

interface InspectionReport {
  inspectedAt: string;
  envSource: string;
  secretExposed: false;
  shellDatabaseUrl: boolean;
  appEnvDatabaseUrl: boolean;
  workspacesScanned: number;
  candidateCenbrapCampaigns: number;
  campaignsWithOutputDerivations: number;
  campaignsWithDualVerdictCoverage: number;
  matches: Array<{
    workspaceId: string;
    workspaceName: string;
    campaignId: string;
    campaignName: string;
    client: string | null;
    selectionSignals: string[];
    outputDerivationCount: number;
    dualVerdictDerivationCount: number;
  }>;
}

interface FixtureSpec {
  name: string;
  client: string;
  objective: string;
  audience: string;
  platforms: string[];
  tone: string;
  offer: string;
  olharVerdict: OlharVerdictPayload;
  exportStatus: ExportStatusPayload;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/seed-cenbrap-calibration-corpus.ts [options]",
    "",
    "Options:",
    "  --dry-run            Preview changes without writing (default)",
    "  --confirm            Apply database and manifest writes",
    "  --inspect-only       Print corpus inspection JSON and exit",
    "  --expand-only        Add missing fixtures without removing existing seed campaigns",
    "  --manifest-path <p>  Manifest output path (default: Phase 144 manifest)",
    "  --sample-expansion   Phase 148 expansion: --expand-only + Phase 148 manifest (5 fixtures)",
    "  --workspace-id <id>  Target workspace UUID",
    "  --workspace-email <email>  Target workspace by member email",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  const workspaceIdIndex = argv.indexOf("--workspace-id");
  const workspaceEmailArg = argv.find((arg) => arg.startsWith("--workspace-email="));
  const workspaceEmailIndex = argv.indexOf("--workspace-email");

  const workspaceId =
    workspaceIdIndex >= 0 ? argv[workspaceIdIndex + 1]?.trim() : undefined;
  let workspaceEmail = workspaceEmailArg?.split("=")[1]?.trim().toLowerCase();
  if (!workspaceEmail && workspaceEmailIndex >= 0) {
    workspaceEmail = argv[workspaceEmailIndex + 1]?.trim().toLowerCase();
  }

  if (workspaceIdIndex >= 0 && !workspaceId) {
    throw new Error("--workspace-id requires a UUID value");
  }

  const manifestPathIndex = argv.indexOf("--manifest-path");
  const sampleExpansion = argv.includes("--sample-expansion");
  const expandOnly = argv.includes("--expand-only") || sampleExpansion;
  let manifestPath = MANIFEST_PATH;
  if (sampleExpansion) {
    manifestPath = PHASE_148_MANIFEST_PATH;
  } else if (manifestPathIndex >= 0) {
    const raw = argv[manifestPathIndex + 1]?.trim();
    if (!raw) {
      throw new Error("--manifest-path requires a file path");
    }
    manifestPath = path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
  }

  return {
    confirm: argv.includes("--confirm"),
    inspectOnly: argv.includes("--inspect-only"),
    expandOnly,
    manifestPath,
    workspaceId,
    workspaceEmail,
  };
}

function evaluatedAt(): string {
  return new Date().toISOString();
}

function buildFixtures(now: string): FixtureSpec[] {
  const axes = { figura: 2, gestalt: 2, voz: 2, convite: 1 } as const;

  return [
    {
      name: `${CAMPAIGN_PREFIX} NR1 Gestalt`,
      client: "Cenbrap",
      objective: "Operational calibration fixture — gestalt hierarchy review",
      audience: "Synthetic calibration audience",
      platforms: ["Instagram", "Facebook"],
      tone: "Institucional",
      offer: "Synthetic fixture — not customer evidence",
      olharVerdict: {
        value: "quase",
        axes,
        whatWorks: ["Clear focal hierarchy for calibration"],
        whatBlocks: ["Lower-third density needs simplification"],
        directionNote: "Calibration fixture — judge gestalt balance only.",
        source: "manual",
        evaluatedAt: now,
      },
      exportStatus: {
        value: "ok",
        issues: [],
        setupIssues: [],
        evaluatedAt: now,
      },
    },
    {
      name: `${CAMPAIGN_PREFIX} NR1 Convite`,
      client: "Cenbrap",
      objective: "Operational calibration fixture — invite/CTA review",
      audience: "Synthetic calibration audience",
      platforms: ["Instagram"],
      tone: "Direto",
      offer: "Synthetic fixture — not customer evidence",
      olharVerdict: {
        value: "pronta",
        axes: { figura: 3, gestalt: 2, voz: 2, convite: 2 },
        whatWorks: ["Invite reads as action without UI chrome"],
        whatBlocks: [],
        directionNote: "Calibration fixture — judge invite clarity only.",
        source: "manual",
        evaluatedAt: now,
      },
      exportStatus: {
        value: "ajuste_menor",
        issues: [
          {
            code: "cta_spacing",
            message: "Minor CTA spacing adjustment for export",
            severity: "warning",
          },
        ],
        setupIssues: [],
        evaluatedAt: now,
      },
    },
    {
      name: `${CAMPAIGN_PREFIX} NR1 Figura`,
      client: "Cenbrap",
      objective: "Operational calibration fixture — figure focal review",
      audience: "Synthetic calibration audience",
      platforms: ["Instagram", "Facebook"],
      tone: "Institucional",
      offer: "Synthetic fixture — not customer evidence",
      olharVerdict: {
        value: "quase",
        axes: { figura: 1, gestalt: 2, voz: 2, convite: 2 },
        whatWorks: ["Subject reads clearly at thumbnail scale"],
        whatBlocks: ["Figure-to-background contrast needs tightening"],
        directionNote: "Calibration fixture — judge figure focal strength only.",
        source: "manual",
        evaluatedAt: now,
      },
      exportStatus: {
        value: "ok",
        issues: [],
        setupIssues: [],
        evaluatedAt: now,
      },
    },
    {
      name: `${CAMPAIGN_PREFIX} NR1 Voz`,
      client: "Cenbrap",
      objective: "Operational calibration fixture — Cenbrap voice review",
      audience: "Synthetic calibration audience",
      platforms: ["Instagram"],
      tone: "Acolhedor",
      offer: "Synthetic fixture — not customer evidence",
      olharVerdict: {
        value: "nao_pronta",
        axes: { figura: 2, gestalt: 2, voz: 1, convite: 2 },
        whatWorks: ["Layout is export-safe"],
        whatBlocks: ["Voice feels generic, not Cenbrap invite"],
        directionNote: "Calibration fixture — judge voice overlay only.",
        source: "manual",
        evaluatedAt: now,
      },
      exportStatus: {
        value: "ok",
        issues: [],
        setupIssues: [],
        evaluatedAt: now,
      },
    },
    {
      name: `${CAMPAIGN_PREFIX} NR1 Equilibrio`,
      client: "Cenbrap",
      objective: "Operational calibration fixture — gestalt/voice balance review",
      audience: "Synthetic calibration audience",
      platforms: ["Facebook"],
      tone: "Direto",
      offer: "Synthetic fixture — not customer evidence",
      olharVerdict: {
        value: "quase",
        axes: { figura: 2, gestalt: 3, voz: 2, convite: 2 },
        whatWorks: ["Balanced composition across axes"],
        whatBlocks: ["Invite competes with headline hierarchy"],
        directionNote: "Calibration fixture — judge cross-axis balance only.",
        source: "manual",
        evaluatedAt: now,
      },
      exportStatus: {
        value: "ajuste_menor",
        issues: [
          {
            code: "headline_spacing",
            message: "Minor headline spacing for export",
            severity: "warning",
          },
        ],
        setupIssues: [],
        evaluatedAt: now,
      },
    },
  ];
}

export async function inspectCenbrapCorpus(): Promise<InspectionReport> {
  const shellDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const wsRows = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces);

  let candidateCenbrapCampaigns = 0;
  let campaignsWithOutputDerivations = 0;
  let campaignsWithDualVerdictCoverage = 0;
  const matches: InspectionReport["matches"] = [];

  for (const workspace of wsRows) {
    const [campaignRows, profiles] = await Promise.all([
      getCampaigns(workspace.id, 200),
      getClientProfiles(workspace.id),
    ]);
    const profileNameById = new Map(profiles.map((profile) => [profile.id, profile.name]));

    for (const campaign of campaignRows) {
      const clientProfileName = campaign.clientProfileId
        ? profileNameById.get(campaign.clientProfileId) ?? null
        : null;
      const match = matchCenbrapCampaign({
        campaign,
        clientProfileName,
      });

      if (!match.isMatch) {
        continue;
      }

      candidateCenbrapCampaigns += 1;
      const derivationRows = await getDerivationsByCampaign(campaign.id, workspace.id);
      const outputDerivations = derivationRows.filter(
        (derivation) => derivation.outputKey && !derivation.isPreview
      );
      const dualVerdictDerivations = outputDerivations.filter(
        (derivation) =>
          derivation.olharVerdict?.value != null && derivation.exportStatus?.value != null
      );

      if (outputDerivations.length > 0) {
        campaignsWithOutputDerivations += 1;
      }
      if (dualVerdictDerivations.length > 0) {
        campaignsWithDualVerdictCoverage += 1;
      }

      matches.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        campaignId: campaign.id,
        campaignName: campaign.name,
        client: campaign.client ?? null,
        selectionSignals: match.signals,
        outputDerivationCount: outputDerivations.length,
        dualVerdictDerivationCount: dualVerdictDerivations.length,
      });
    }
  }

  return {
    inspectedAt: evaluatedAt(),
    envSource: "app/.env.local",
    secretExposed: false,
    shellDatabaseUrl,
    appEnvDatabaseUrl: shellDatabaseUrl,
    workspacesScanned: wsRows.length,
    candidateCenbrapCampaigns,
    campaignsWithOutputDerivations,
    campaignsWithDualVerdictCoverage,
    matches,
  };
}

async function resolveTargetWorkspace(options: CliOptions): Promise<{
  workspaceId: string;
  workspaceName: string;
  memberEmail: string | null;
}> {
  if (options.workspaceId) {
    const rows = await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, options.workspaceId))
      .limit(1);
    if (!rows[0]) {
      throw new Error(`Workspace ${options.workspaceId} not found`);
    }
    return {
      workspaceId: rows[0].id,
      workspaceName: rows[0].name,
      memberEmail: null,
    };
  }

  const memberships = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      workspaceName: workspaces.name,
      email: user.email,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(user, eq(user.id, workspaceMembers.userId));

  if (options.workspaceEmail) {
    const match = memberships.find(
      (row) => row.email.toLowerCase() === options.workspaceEmail
    );
    if (!match) {
      throw new Error(`No workspace membership for email ${options.workspaceEmail}`);
    }
    return {
      workspaceId: match.workspaceId,
      workspaceName: match.workspaceName,
      memberEmail: match.email,
    };
  }

  const first = memberships[0];
  if (!first) {
    throw new Error("No workspace memberships found in target database");
  }

  return {
    workspaceId: first.workspaceId,
    workspaceName: first.workspaceName,
    memberEmail: first.email,
  };
}

async function clearSeedCampaigns(workspaceId: string, confirm: boolean): Promise<number> {
  const existing = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.workspaceId, workspaceId),
        like(campaigns.name, `${CAMPAIGN_PREFIX}%`)
      )
    );

  if (!confirm) {
    return existing.length;
  }

  for (const row of existing) {
    await db.delete(campaigns).where(eq(campaigns.id, row.id));
  }

  return existing.length;
}

function outputKeyFor(workspaceId: string, campaignSlug: string): string {
  return `cenbrap-calibration/${workspaceId.slice(0, 8)}/${campaignSlug}.png`;
}

async function getExistingSeedCampaignRows(
  workspaceId: string
): Promise<Map<string, { campaignId: string; derivationId: string; outputKey: string }>> {
  const existing = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.workspaceId, workspaceId),
        like(campaigns.name, `${CAMPAIGN_PREFIX}%`)
      )
    );

  const byName = new Map<string, { campaignId: string; derivationId: string; outputKey: string }>();

  for (const campaign of existing) {
    const derivationRows = await getDerivationsByCampaign(campaign.id, workspaceId);
    const outputDerivation = derivationRows.find(
      (derivation) => derivation.outputKey && !derivation.isPreview
    );
    if (!outputDerivation?.outputKey) {
      continue;
    }
    byName.set(campaign.name, {
      campaignId: campaign.id,
      derivationId: outputDerivation.id,
      outputKey: outputDerivation.outputKey,
    });
  }

  return byName;
}

async function seedWorkspace(
  workspaceId: string,
  confirm: boolean,
  expandOnly: boolean
): Promise<
  Array<{
    campaignId: string;
    campaignName: string;
    derivationId: string;
    sourceLabel: CorpusSourceLabel;
    selectionSignals: string[];
    outputKey: string;
    olharVerdict: OlharVerdictValue;
    exportStatus: ExportStatusValue;
  }>
> {
  const now = evaluatedAt();
  const fixtures = buildFixtures(now);
  const seeded: Array<{
    campaignId: string;
    campaignName: string;
    derivationId: string;
    sourceLabel: CorpusSourceLabel;
    selectionSignals: string[];
    outputKey: string;
    olharVerdict: OlharVerdictValue;
    exportStatus: ExportStatusValue;
  }> = [];

  const existingByName = expandOnly
    ? await getExistingSeedCampaignRows(workspaceId)
    : new Map<string, { campaignId: string; derivationId: string; outputKey: string }>();

  if (!expandOnly) {
    const removed = await clearSeedCampaigns(workspaceId, confirm);
    if (!confirm) {
      console.log(`[dry-run] Would remove ${removed} existing seed campaign(s)`);
    }
  } else if (confirm) {
    console.log(
      `Expand-only mode — preserving ${existingByName.size} existing seed campaign(s)`
    );
  } else {
    console.log(
      `[dry-run] Expand-only mode — would preserve ${existingByName.size} existing seed campaign(s)`
    );
  }

  for (const fixture of fixtures) {
    const slug = fixture.name.replace(CAMPAIGN_PREFIX, "").trim().toLowerCase().replace(/\s+/g, "-");
    const storageKey = outputKeyFor(workspaceId, slug);
    const match = matchCenbrapCampaign({
      campaign: { name: fixture.name, client: fixture.client, clientProfileId: null },
      clientProfileName: null,
    });

    const existing = existingByName.get(fixture.name);
    if (expandOnly && existing) {
      seeded.push({
        campaignId: existing.campaignId,
        campaignName: fixture.name,
        derivationId: existing.derivationId,
        sourceLabel: "synthetic_fixture",
        selectionSignals: match.signals,
        outputKey: existing.outputKey,
        olharVerdict: fixture.olharVerdict.value,
        exportStatus: fixture.exportStatus.value,
      });
      continue;
    }

    if (!confirm) {
      console.log(`[dry-run] Would create campaign "${fixture.name}" with derivation and dual verdict`);
      seeded.push({
        campaignId: "dry-run",
        campaignName: fixture.name,
        derivationId: "dry-run",
        sourceLabel: "synthetic_fixture",
        selectionSignals: match.signals,
        outputKey: storageKey,
        olharVerdict: fixture.olharVerdict.value,
        exportStatus: fixture.exportStatus.value,
      });
      continue;
    }

    await objectStorage.put(storageKey, PNG_1X1, "image/png");

    const campaign = await createCampaign(workspaceId, {
      name: fixture.name,
      client: fixture.client,
      objective: fixture.objective,
      audience: fixture.audience,
      platforms: fixture.platforms,
      tone: fixture.tone,
      offer: fixture.offer,
      constraints: `seed_marker=${SEED_MARKER}; source=synthetic_fixture`,
      status: "active",
      notes: SEED_MARKER,
    });

    const derivation = await createDerivation({
      campaignId: campaign.id,
      workspaceId,
      status: "completed",
      format: "1:1",
      generationMode: "art_variation",
      variantIndex: 0,
      ctaText: "Saiba mais",
      isPreview: false,
    });

    await updateDerivationStatus(derivation.id, workspaceId, "completed", storageKey);
    await updateDerivationDualVerdict(derivation.id, workspaceId, {
      olharVerdict: fixture.olharVerdict,
      exportStatus: fixture.exportStatus,
    });

    seeded.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      derivationId: derivation.id,
      sourceLabel: "synthetic_fixture",
      selectionSignals: match.signals,
      outputKey: storageKey,
      olharVerdict: fixture.olharVerdict.value,
      exportStatus: fixture.exportStatus.value,
    });
  }

  return seeded;
}

type OlharVerdictValue = OlharVerdictPayload["value"];
type ExportStatusValue = ExportStatusPayload["value"];

function writeManifest(input: {
  workspaceId: string;
  workspaceName: string;
  memberEmail: string | null;
  seeded: Awaited<ReturnType<typeof seedWorkspace>>;
  confirm: boolean;
  manifestPath: string;
  expandOnly: boolean;
}): void {
  const manifest = {
    schemaVersion: 1,
    capturedAt: evaluatedAt(),
    seedMarker: SEED_MARKER,
    phase: input.manifestPath === PHASE_148_MANIFEST_PATH ? 148 : 144,
    mode: input.confirm ? (input.expandOnly ? "expanded" : "applied") : "dry_run",
    envSource: "app/.env.local",
    secretExposed: false,
    targetWorkspace: {
      id: input.workspaceId,
      name: input.workspaceName,
      memberEmail: input.memberEmail,
    },
    sourcePolicy:
      "All rows in this manifest are synthetic_fixture — operational calibration only, not real customer evidence.",
    campaigns: input.seeded.map((row) => ({
      id: row.campaignId,
      name: row.campaignName,
      sourceLabel: row.sourceLabel,
      selectionSignals: row.selectionSignals,
      derivationId: row.derivationId,
      outputKey: row.outputKey,
      olharVerdict: row.olharVerdict,
      exportStatus: row.exportStatus,
    })),
  };

  if (input.confirm) {
    mkdirSync(path.dirname(input.manifestPath), { recursive: true });
    writeFileSync(input.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote manifest to ${input.manifestPath}`);
  } else {
    console.log("[dry-run] Manifest preview:");
    console.log(JSON.stringify(manifest, null, 2));
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.inspectOnly) {
    const report = await inspectCenbrapCorpus();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const inspection = await inspectCenbrapCorpus();
  console.log(
    `Inspection: ${inspection.candidateCenbrapCampaigns} candidate campaign(s) across ${inspection.workspacesScanned} workspace(s)`
  );

  const target = await resolveTargetWorkspace(options);
  console.log(
    `Target workspace: ${target.workspaceName} (${target.workspaceId})${
      target.memberEmail ? ` — ${target.memberEmail}` : ""
    }`
  );

  if (!options.confirm) {
    console.log("Dry-run mode — pass --confirm to write seed data and manifest.");
  }

  const seeded = await seedWorkspace(target.workspaceId, options.confirm, options.expandOnly);
  writeManifest({
    workspaceId: target.workspaceId,
    workspaceName: target.workspaceName,
    memberEmail: target.memberEmail,
    seeded,
    confirm: options.confirm,
    manifestPath: options.manifestPath,
    expandOnly: options.expandOnly,
  });

  if (options.confirm) {
    const post = await inspectCenbrapCorpus();
    console.log(
      `Post-seed inspection: ${post.candidateCenbrapCampaigns} candidate campaign(s), ${post.campaignsWithDualVerdictCoverage} with dual verdict coverage`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

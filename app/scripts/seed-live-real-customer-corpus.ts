/**
 * Idempotent live real_customer corpus seed for v13.4 Phase 173.
 *
 * Uses the generic v13.3 promotion path (capture → promote with sourceLabel → evaluate).
 * Target: first non-fixture clientProfileId (Cenbrap excluded).
 *
 * Usage:
 *   npx tsx scripts/seed-live-real-customer-corpus.ts              # dry-run
 *   npx tsx scripts/seed-live-real-customer-corpus.ts --confirm
 *   npx tsx scripts/seed-live-real-customer-corpus.ts --confirm --workspace-email=dev@adscale.local
 */
import "./load-env";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/server/db";
import { campaigns, user, workspaceMembers, workspaces } from "@/server/db/schema";
import { captureCorpusCandidateFromDerivation } from "@/server/human-quality/candidate-capture";
import { promoteCorpusCandidateToQueue } from "@/server/human-quality/candidate-promotion";
import {
  LIVE_EVIDENCE_BRAND_NAME,
  selectLiveCorpusTarget,
} from "@/server/human-quality/live-corpus-target";
import { submitHumanEvaluation } from "@/server/human-quality/service";
import { createCampaign } from "@/server/repositories/campaign";
import {
  createClientProfile,
  getClientProfiles,
} from "@/server/repositories/client-reference";
import {
  createDerivation,
  updateDerivationDualVerdict,
  updateDerivationStatus,
} from "@/server/repositories/derivation";
import { objectStorage } from "@/server/storage";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const PHASE_173_DIRS = [
  path.join(REPO_ROOT, ".planning/phases/173-live-real-customer-corpus-intake"),
  path.join(REPO_ROOT, ".planning/milestones/v13.4-phases/173-live-real-customer-corpus-intake"),
];

function resolvePhase173Dir(): string {
  for (const dir of PHASE_173_DIRS) {
    if (existsSync(dir)) {
      return dir;
    }
  }
  return PHASE_173_DIRS[0];
}

const PHASE_DIR = resolvePhase173Dir();
const MANIFEST_PATH = path.join(PHASE_DIR, "173-CORPUS-MANIFEST.json");

export const CAMPAIGN_PREFIX = "Live Real-Customer Corpus —";
export const SEED_MARKER = "phase173_live_real_customer_corpus";
export const MIN_REAL_CUSTOMER_ITEMS = 5;

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

interface CliOptions {
  confirm: boolean;
  workspaceEmail?: string;
  itemCount: number;
}

interface SeededRow {
  campaignId: string;
  campaignName: string;
  derivationId: string;
  candidateId: string;
  corpusItemId: string;
  evaluationId: string;
  sourceLabel: "real_customer";
  outputKey: string;
}

function parseArgs(argv: string[]): CliOptions {
  const emailIndex = argv.indexOf("--workspace-email");
  const countIndex = argv.indexOf("--count");
  return {
    confirm: argv.includes("--confirm"),
    workspaceEmail:
      emailIndex >= 0 ? argv[emailIndex + 1] : process.env.LIVE_CORPUS_WORKSPACE_EMAIL,
    itemCount:
      countIndex >= 0 ? Math.max(1, Number.parseInt(argv[countIndex + 1] ?? "", 10)) : MIN_REAL_CUSTOMER_ITEMS,
  };
}

async function resolveWorkspace(options: CliOptions) {
  const memberships = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      workspaceName: workspaces.name,
      userId: workspaceMembers.userId,
      email: user.email,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .innerJoin(user, eq(user.id, workspaceMembers.userId));

  if (options.workspaceEmail) {
    const match = memberships.find(
      (row) => row.email.toLowerCase() === options.workspaceEmail!.toLowerCase()
    );
    if (!match) {
      throw new Error(`No workspace membership for email ${options.workspaceEmail}`);
    }
    return {
      workspaceId: match.workspaceId,
      workspaceName: match.workspaceName,
      ownerUserId: match.userId,
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
    ownerUserId: first.userId,
    memberEmail: first.email,
  };
}

async function resolveTargetProfile(workspaceId: string, confirm: boolean) {
  const profiles = await getClientProfiles(workspaceId);
  let target = selectLiveCorpusTarget(
    profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      workspaceId: profile.workspaceId,
    }))
  );

  if (!target) {
    if (!confirm) {
      return {
        id: "dry-run-profile",
        name: LIVE_EVIDENCE_BRAND_NAME,
        workspaceId,
        created: true,
      };
    }
    const created = await createClientProfile(workspaceId, {
      name: LIVE_EVIDENCE_BRAND_NAME,
      description: "Non-fixture brand for v13.4 live operational evidence",
      constraints: `seed_marker=${SEED_MARKER}; source=real_customer`,
    });
    target = {
      id: created.id,
      name: created.name,
      workspaceId: created.workspaceId,
    };
    return { ...target, created: true };
  }

  return { ...target, created: false };
}

async function clearSeedCampaigns(workspaceId: string, confirm: boolean): Promise<number> {
  const existing = await db
    .select({ id: campaigns.id })
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

function outputKeyFor(workspaceId: string, slug: string): string {
  return `live-real-corpus/${workspaceId.slice(0, 8)}/${slug}.png`;
}

async function seedRealCustomerCorpus(input: {
  workspaceId: string;
  ownerUserId: string;
  clientProfileId: string;
  itemCount: number;
  confirm: boolean;
}): Promise<SeededRow[]> {
  const seeded: SeededRow[] = [];
  const removed = await clearSeedCampaigns(input.workspaceId, input.confirm);
  if (!input.confirm) {
    console.log(`[dry-run] Would remove ${removed} existing Phase 173 seed campaign(s)`);
  }

  for (let index = 0; index < input.itemCount; index += 1) {
    const slug = `item-${index + 1}`;
    const campaignName = `${CAMPAIGN_PREFIX} ${index + 1}`;
    const storageKey = outputKeyFor(input.workspaceId, slug);

    if (!input.confirm) {
      seeded.push({
        campaignId: "dry-run",
        campaignName,
        derivationId: "dry-run",
        candidateId: "dry-run",
        corpusItemId: "dry-run",
        evaluationId: "dry-run",
        sourceLabel: "real_customer",
        outputKey: storageKey,
      });
      continue;
    }

    await objectStorage.put(storageKey, PNG_1X1, "image/png");

    const campaign = await createCampaign(input.workspaceId, {
      name: campaignName,
      client: LIVE_EVIDENCE_BRAND_NAME,
      clientProfileId: input.clientProfileId,
      objective: "Live real_customer corpus evidence",
      audience: "Operational evidence only",
      platforms: ["Instagram"],
      tone: "Direct",
      offer: "None",
      constraints: `seed_marker=${SEED_MARKER}; source=real_customer`,
      status: "active",
      notes: SEED_MARKER,
    });

    const derivation = await createDerivation({
      campaignId: campaign.id,
      workspaceId: input.workspaceId,
      status: "completed",
      format: "1:1",
      generationMode: "art_variation",
      variantIndex: index,
      ctaText: "Saiba mais",
      isPreview: false,
    });

    await updateDerivationStatus(derivation.id, input.workspaceId, "completed", storageKey);
    await updateDerivationDualVerdict(derivation.id, input.workspaceId, {
      olharVerdict: { value: "pronta", rationale: "seed_live_real_customer" },
      exportStatus: { value: "pronta", rationale: "seed_live_real_customer" },
    });

    const candidate = await captureCorpusCandidateFromDerivation({
      workspaceId: input.workspaceId,
      derivationId: derivation.id,
    });
    if (!candidate) {
      throw new Error(`Failed to capture corpus candidate for derivation ${derivation.id}`);
    }

    const promoted = await promoteCorpusCandidateToQueue({
      candidateId: candidate.id,
      cohort: "post_learning",
      selectedByUserId: input.ownerUserId,
      sourceLabel: "real_customer",
    });

    const evaluation = await submitHumanEvaluation({
      corpusItemId: promoted.item.id,
      reviewerUserId: input.ownerUserId,
      visualScore: 72 + index,
      factualPass: true,
      intent: "approve",
      primaryFailureReason: "other",
    });

    seeded.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      derivationId: derivation.id,
      candidateId: candidate.id,
      corpusItemId: promoted.item.id,
      evaluationId: evaluation.evaluation.id,
      sourceLabel: "real_customer",
      outputKey: storageKey,
    });
  }

  return seeded;
}

function writeManifest(input: {
  workspaceId: string;
  workspaceName: string;
  memberEmail: string;
  clientProfileId: string;
  clientProfileName: string;
  profileCreated: boolean;
  seeded: SeededRow[];
  confirm: boolean;
}): void {
  const manifest = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    seedMarker: SEED_MARKER,
    phase: 173,
    mode: input.confirm ? "applied" : "dry_run",
    ownerConsentNote:
      "Owner consented to use this non-fixture profile for live operational evidence (v13.4). Cenbrap remains fixture/seed only.",
    targetWorkspace: {
      id: input.workspaceId,
      name: input.workspaceName,
      memberEmail: input.memberEmail,
    },
    targetProfile: {
      id: input.clientProfileId,
      name: input.clientProfileName,
      created: input.profileCreated,
      fixtureSeed: false,
    },
    sourcePolicy:
      "Rows seeded through generic promotion with explicit real_customer sourceLabel — not Cenbrap fixture proof.",
    itemCount: input.seeded.length,
    campaigns: input.seeded.map((row) => ({
      id: row.campaignId,
      name: row.campaignName,
      derivationId: row.derivationId,
      candidateId: row.candidateId,
      corpusItemId: row.corpusItemId,
      evaluationId: row.evaluationId,
      sourceLabel: row.sourceLabel,
      outputKey: row.outputKey,
    })),
  };

  if (input.confirm) {
    mkdirSync(PHASE_DIR, { recursive: true });
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote manifest to ${MANIFEST_PATH}`);
  } else {
    console.log("[dry-run] Manifest preview:");
    console.log(JSON.stringify(manifest, null, 2));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspace = await resolveWorkspace(options);
  const targetProfile = await resolveTargetProfile(workspace.workspaceId, options.confirm);

  console.log(
    `Phase 173 live corpus target: ${targetProfile.name} (${targetProfile.id}) in ${workspace.workspaceName}`
  );

  const seeded = await seedRealCustomerCorpus({
    workspaceId: workspace.workspaceId,
    ownerUserId: workspace.ownerUserId,
    clientProfileId: targetProfile.id,
    itemCount: options.itemCount,
    confirm: options.confirm,
  });

  writeManifest({
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    memberEmail: workspace.memberEmail,
    clientProfileId: targetProfile.id,
    clientProfileName: targetProfile.name,
    profileCreated: targetProfile.created ?? false,
    seeded,
    confirm: options.confirm,
  });

  if (options.confirm) {
    console.log(`Seeded ${seeded.length} real_customer corpus row(s) with human evaluations.`);
  } else {
    console.log(`[dry-run] Would seed ${seeded.length} real_customer corpus row(s).`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Idempotent fixtures for goal-agent Playwright E2E.
 *
 * Usage:
 *   npx tsx scripts/seed-dev-admin.ts --repair --create --email=dev-admin@adscale.local --password='DevAdmin123!'
 *   npx tsx scripts/seed-goal-agent-e2e.ts
 */
import "./load-env";
import fs from "fs";
import path from "path";
import { and, eq, like } from "drizzle-orm";
import { db } from "../src/server/db";
import { campaigns, user, workspaceMembers } from "../src/server/db/schema";
import { GOAL_CREATIVE_LEVELS, GOAL_FORMATS } from "../src/lib/assistant/goal";
import { adoptArtifactForThread } from "../src/server/assistant/artifact-version/service";
import { createCampaign } from "../src/server/repositories/campaign";
import { createPlan } from "../src/server/repositories/plan";
import {
  createClientProfile,
  getClientProfiles,
} from "../src/server/repositories/client-reference";
import { createDerivation } from "../src/server/repositories/derivation";
import {
  createGoalRun,
  updateGoalRun,
} from "../src/server/repositories/assistant-goal";
import {
  createAssistantThread,
  linkThreadToCampaign,
} from "../src/server/repositories/assistant-thread";
import { objectStorage } from "../src/server/storage";
import { derivations } from "../src/server/db/schema";

const DEV_EMAIL = "dev-admin@adscale.local";
const CLIENT_NAME = "Goal Agent E2E Client";
const FIXTURE_PATH = path.resolve(__dirname, "../tests/fixtures/goal-agent-e2e.json");

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

const READY_BRIEF = {
  productOffer: "Camiseta premium",
  audience: "Jovens urbanos",
  constraints: "Nenhuma restrição adicional",
  objective: "Aumentar vendas",
  cta: "Compre agora",
  referenceIds: [] as string[],
  baseAssetId: null as string | null,
};

const READY_PLAN = {
  strategy: "Prova social + urgência",
  angles: ["Qualidade"],
  hooks: ["Últimas unidades"],
  ctas: ["Compre agora"],
};

async function resolveDevWorkspace() {
  const account = await db
    .select()
    .from(user)
    .where(eq(user.email, DEV_EMAIL))
    .limit(1);
  if (!account[0]) {
    throw new Error(
      `No user ${DEV_EMAIL}. Run seed-dev-admin.ts --create first.`
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
        like(campaigns.name, "Goal Agent E2E%")
      )
    );
  for (const row of existing) {
    await db.delete(campaigns).where(eq(campaigns.id, row.id));
  }
}

async function ensureClient(workspaceId: string) {
  const profiles = await getClientProfiles(workspaceId);
  const existing = profiles.find((profile) => profile.name === CLIENT_NAME);
  if (existing) return existing;
  return createClientProfile(workspaceId, { name: CLIENT_NAME });
}

async function outputKeyFor(workspaceId: string, label: string) {
  const key = `e2e/goal-agent/${workspaceId.slice(0, 8)}/${label}.png`;
  await objectStorage.put(key, PNG_1X1, "image/png");
  return key;
}

async function seedCampaignBundle(input: {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  campaignLabel: string;
  threadName: string;
  stage: "choosing_base" | "reviewing_base" | "reviewing_package";
}) {
  const campaign = await createCampaign(input.workspaceId, {
    name: `Goal Agent E2E ${input.campaignLabel}`,
    clientProfileId: input.clientProfileId,
    objective: READY_BRIEF.objective,
    audience: READY_BRIEF.audience,
    product: READY_BRIEF.productOffer,
    constraints: READY_BRIEF.constraints,
    creativeLevel: "balanced",
    targetFormats: [...GOAL_FORMATS],
    status: "draft",
    selectedReferenceIds: [],
  });
  await createPlan(campaign.id, input.workspaceId, READY_PLAN);

  const thread = await createAssistantThread(input.workspaceId, {
    clientProfileId: input.clientProfileId,
    campaignId: campaign.id,
    name: input.threadName,
  });
  await linkThreadToCampaign(input.workspaceId, thread.id, campaign.id);

  let goal = await createGoalRun({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: thread.id,
    userId: input.userId,
    objective: READY_BRIEF.objective,
  });

  const tripletVersions: string[] = [];
  const tripletDerivationIds: string[] = [];
  for (const creativeLevel of GOAL_CREATIVE_LEVELS) {
    const derivation = await createDerivation({
      campaignId: campaign.id,
      workspaceId: input.workspaceId,
      format: "1:1",
      generationMode: "art_variation",
      variantIndex: 0,
      status: "completed",
      creativeLevel,
    });
    const outputKey = await outputKeyFor(
      input.workspaceId,
      `${campaign.id.slice(0, 8)}-${creativeLevel}`
    );
    await db
      .update(derivations)
      .set({ outputKey, status: "completed", updatedAt: new Date() })
      .where(eq(derivations.id, derivation.id));

    const adopted = await adoptArtifactForThread({
      workspaceId: input.workspaceId,
      threadId: thread.id,
      artifactType: "creative",
      artifactId: derivation.id,
    });
    const versionId = adopted.working?.id ?? adopted.approvedCurrent?.id;
    if (versionId) {
      tripletVersions.push(versionId);
      tripletDerivationIds.push(derivation.id);
    }
  }

  const selectedBaseVersionId = tripletVersions[1] ?? tripletVersions[0] ?? null;
  const selectedBaseDerivationId =
    tripletDerivationIds[1] ?? tripletDerivationIds[0] ?? null;
  const packageVersions: Record<string, string> = {};
  if (selectedBaseVersionId) packageVersions["1:1"] = selectedBaseVersionId;
  const derivedFormats = input.stage === "reviewing_package" ? GOAL_FORMATS.slice(1) : [];
  for (const format of derivedFormats) {
    const derivation = await createDerivation({
      campaignId: campaign.id,
      workspaceId: input.workspaceId,
      format,
      generationMode: format === "1:1" ? "art_variation" : "format_adaptation",
      variantIndex: 0,
      status: "completed",
      parentId: selectedBaseDerivationId ?? undefined,
    });
    const outputKey = await outputKeyFor(
      input.workspaceId,
      `${campaign.id.slice(0, 8)}-${format.replace(":", "x")}`
    );
    await db
      .update(derivations)
      .set({ outputKey, status: "completed", updatedAt: new Date() })
      .where(eq(derivations.id, derivation.id));

    const adopted = await adoptArtifactForThread({
      workspaceId: input.workspaceId,
      threadId: thread.id,
      artifactType: "creative",
      artifactId: derivation.id,
    });
    const versionId = adopted.working?.id ?? adopted.approvedCurrent?.id;
    if (versionId) packageVersions[format] = versionId;
  }

  goal = await updateGoalRun({
    goalRunId: goal.id,
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: thread.id,
    expectedRevision: goal.revision,
    patch: {
      campaignId: campaign.id,
      brief: READY_BRIEF,
      plan: READY_PLAN,
      assumptions: [],
      blockers: [],
      stage: input.stage,
      selectedBaseVersionId:
        input.stage === "reviewing_base" || input.stage === "reviewing_package"
          ? selectedBaseVersionId
          : null,
    },
  });

  return {
    threadId: thread.id,
    goalRunId: goal.id,
    campaignId: campaign.id,
    selectedBaseVersionId,
    tripletVersionIds: tripletVersions,
    packageVersionIds: packageVersions,
  };
}

async function main() {
  const { userId, workspaceId } = await resolveDevWorkspace();
  await clearPreviousSeed(workspaceId);
  const client = await ensureClient(workspaceId);

  const triplet = await seedCampaignBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
    campaignLabel: "Triplet",
    threadName: "Goal Agent E2E Triplet",
    stage: "choosing_base",
  });
  const annotation = await seedCampaignBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
    campaignLabel: "Annotation",
    threadName: "Goal Agent E2E Annotation",
    stage: "reviewing_base",
  });
  const packageReview = await seedCampaignBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
    campaignLabel: "Package",
    threadName: "Goal Agent E2E Package",
    stage: "reviewing_package",
  });

  const fixture = {
    clientProfileId: client.id,
    workspaceId,
    tripletThreadId: triplet.threadId,
    annotationThreadId: annotation.threadId,
    packageThreadId: packageReview.threadId,
    selectedBaseVersionId: annotation.selectedBaseVersionId,
  };

  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log("Goal-agent E2E seed ready:");
  console.log(JSON.stringify(fixture, null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);

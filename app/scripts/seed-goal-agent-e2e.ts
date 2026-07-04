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
  upsertAnnotationDraft,
} from "../src/server/repositories/assistant-goal";
import {
  createAssistantThread,
  linkThreadToCampaign,
} from "../src/server/repositories/assistant-thread";
import { createAssistantAction } from "../src/server/repositories/assistant-action";
import { createWorkspaceAsset } from "../src/server/repositories/workspace-asset";
import { objectStorage } from "../src/server/storage";
import { derivations } from "../src/server/db/schema";

const DEV_EMAIL = "dev-admin@adscale.local";
const CLIENT_NAME = "Goal Agent E2E Client";
const OTHER_CLIENT_NAME = "Goal Agent E2E Other Client";
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

async function ensureClient(workspaceId: string, name: string) {
  const profiles = await getClientProfiles(workspaceId);
  const existing = profiles.find((profile) => profile.name === name);
  if (existing) return existing;
  return createClientProfile(workspaceId, { name });
}

async function seedPendingAction(input: {
  workspaceId: string;
  threadId: string;
  goalRunId: string;
  goalRevision: number;
  actionType: "generate_creative_triplet" | "generate_goal_package";
  planVersionId: string;
  baseVersionId?: string;
}) {
  const isTriplet = input.actionType === "generate_creative_triplet";
  const inputSnapshot = isTriplet
    ? {
        goalRunId: input.goalRunId,
        goalRevision: input.goalRevision,
        planVersionId: input.planVersionId,
        format: "1:1" as const,
      }
    : {
        goalRunId: input.goalRunId,
        goalRevision: input.goalRevision,
        planVersionId: input.planVersionId,
        baseVersionId: input.baseVersionId!,
      };
  const riskCopyLines = isTriplet
    ? ["Cobrança definitiva: não há estorno, inclusive se uma geração falhar."]
    : [
        "A peça-base 1:1 já conta no pacote.",
        "Cobrança definitiva: não há estorno, inclusive se uma geração falhar.",
      ];
  const label = isTriplet
    ? "Gerar três direções criativas"
    : "Gerar pacote de formatos";
  const creditImpact = isTriplet
    ? {
        kind: "creditAction" as const,
        action: "image_derivation",
        amount: 15,
        label: "15 créditos",
      }
    : {
        kind: "creditAction" as const,
        action: "delivery_package_child",
        amount: 15,
        label: "15 créditos — três formatos adicionais",
      };
  const { action } = await createAssistantAction(input.workspaceId, {
    threadId: input.threadId,
    content: label,
    inputSnapshot,
    display: {
      label,
      actionType: input.actionType,
      intentFamily: "complete_campaign",
      riskLabel: "high",
      creditImpact,
      riskCopyLines,
      confirmationPolicy: "required",
    },
  });
  return action.id;
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
    goalRevision: goal.revision,
  };
}

async function seedIntakeBundle(input: {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  campaignLabel: string;
  threadName: string;
  brief: typeof READY_BRIEF;
  blockers: string[];
  baseAssetId?: string | null;
}) {
  const campaign = await createCampaign(input.workspaceId, {
    name: `Goal Agent E2E ${input.campaignLabel}`,
    clientProfileId: input.clientProfileId,
    objective: input.brief.objective,
    audience: input.brief.audience,
    product: input.brief.productOffer,
    constraints: input.brief.constraints,
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
    objective: input.brief.objective,
  });

  goal = await updateGoalRun({
    goalRunId: goal.id,
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: thread.id,
    expectedRevision: goal.revision,
    patch: {
      campaignId: campaign.id,
      brief: input.brief,
      plan: READY_PLAN,
      assumptions: input.baseAssetId ? ["existing_piece"] : [],
      blockers: input.blockers,
      stage: "intake",
    },
  });

  return { threadId: thread.id, goalRunId: goal.id, goalRevision: goal.revision };
}

async function seedCompletedBundle(input: {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
}) {
  const bundle = await seedCampaignBundle({
    workspaceId: input.workspaceId,
    userId: input.userId,
    clientProfileId: input.clientProfileId,
    campaignLabel: "Completed",
    threadName: "Goal Agent E2E Completed",
    stage: "reviewing_package",
  });

  await db
    .update(derivations)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(derivations.campaignId, bundle.campaignId));

  await updateGoalRun({
    goalRunId: bundle.goalRunId,
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: bundle.threadId,
    expectedRevision: bundle.goalRevision,
    patch: {
      stage: "completed",
      completedAt: new Date(),
      selectedBaseVersionId: bundle.selectedBaseVersionId,
    },
  });

  return bundle;
}

async function seedAnnotationHistoryBundle(input: {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
}) {
  const bundle = await seedCampaignBundle({
    workspaceId: input.workspaceId,
    userId: input.userId,
    clientProfileId: input.clientProfileId,
    campaignLabel: "AnnotationHistory",
    threadName: "Goal Agent E2E Annotation History",
    stage: "reviewing_base",
  });
  const oldVersionId = bundle.tripletVersionIds[0];
  const currentVersionId = bundle.selectedBaseVersionId;
  if (!oldVersionId || !currentVersionId) {
    throw new Error("Annotation history seed missing version ids");
  }

  await upsertAnnotationDraft({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    threadId: bundle.threadId,
    goalRunId: bundle.goalRunId,
    versionId: oldVersionId,
    createdByUserId: input.userId,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    comment: "Histórico na versão antiga",
  });

  return {
    ...bundle,
    oldVersionId,
    currentVersionId,
  };
}

async function main() {
  const { userId, workspaceId } = await resolveDevWorkspace();
  await clearPreviousSeed(workspaceId);
  const client = await ensureClient(workspaceId, CLIENT_NAME);
  const otherClient = await ensureClient(workspaceId, OTHER_CLIENT_NAME);

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

  const intake = await seedIntakeBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
    campaignLabel: "Intake",
    threadName: "Goal Agent E2E Intake",
    brief: {
      ...READY_BRIEF,
      audience: "",
      constraints: "",
    },
    blockers: ["audience", "constraints"],
  });

  const baseAsset = await createWorkspaceAsset({
    workspaceId,
    key: await outputKeyFor(
      workspaceId,
      `existing-piece-${crypto.randomUUID().slice(0, 8)}`
    ),
    type: "image",
    name: "existing-piece.png",
    size: PNG_1X1.length,
    source: "upload",
  });
  const existingPiece = await seedIntakeBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
    campaignLabel: "ExistingPiece",
    threadName: "Goal Agent E2E Existing Piece",
    brief: {
      ...READY_BRIEF,
      productOffer: "",
      audience: "",
      constraints: "",
      baseAssetId: baseAsset.id,
    },
    blockers: ["productOffer", "audience", "constraints"],
    baseAssetId: baseAsset.id,
  });

  const tripletAction = await seedCampaignBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
    campaignLabel: "TripletAction",
    threadName: "Goal Agent E2E Triplet Action",
    stage: "choosing_base",
  });
  const tripletPendingActionId = await seedPendingAction({
    workspaceId,
    threadId: tripletAction.threadId,
    goalRunId: tripletAction.goalRunId,
    goalRevision: tripletAction.goalRevision,
    actionType: "generate_creative_triplet",
    planVersionId: crypto.randomUUID(),
  });
  await updateGoalRun({
    goalRunId: tripletAction.goalRunId,
    workspaceId,
    clientProfileId: client.id,
    threadId: tripletAction.threadId,
    expectedRevision: tripletAction.goalRevision,
    patch: { stage: "awaiting_generation" },
  });
  const tripletActionGoalRevision = tripletAction.goalRevision + 1;

  const packageAction = await seedCampaignBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
    campaignLabel: "PackageAction",
    threadName: "Goal Agent E2E Package Action",
    stage: "reviewing_base",
  });
  const packagePendingActionId = await seedPendingAction({
    workspaceId,
    threadId: packageAction.threadId,
    goalRunId: packageAction.goalRunId,
    goalRevision: packageAction.goalRevision,
    actionType: "generate_goal_package",
    planVersionId: crypto.randomUUID(),
    baseVersionId: packageAction.selectedBaseVersionId ?? undefined,
  });

  const completed = await seedCompletedBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
  });

  const annotationHistory = await seedAnnotationHistoryBundle({
    workspaceId,
    userId,
    clientProfileId: client.id,
  });

  const otherClientThread = await createAssistantThread(workspaceId, {
    clientProfileId: otherClient.id,
    name: "Goal Agent E2E Other Client Thread",
  });
  await createGoalRun({
    workspaceId,
    clientProfileId: otherClient.id,
    threadId: otherClientThread.id,
    userId,
    objective: "Objetivo outro cliente",
  });

  const fixture = {
    clientProfileId: client.id,
    otherClientProfileId: otherClient.id,
    workspaceId,
    tripletThreadId: triplet.threadId,
    tripletGoalRunId: triplet.goalRunId,
    annotationThreadId: annotation.threadId,
    packageThreadId: packageReview.threadId,
    intakeThreadId: intake.threadId,
    existingPieceThreadId: existingPiece.threadId,
    tripletActionThreadId: tripletAction.threadId,
    tripletPendingActionId,
    tripletActionGoalRevision,
    packageActionThreadId: packageAction.threadId,
    packagePendingActionId,
    completedThreadId: completed.threadId,
    completedGoalRunId: completed.goalRunId,
    annotationHistoryThreadId: annotationHistory.threadId,
    annotationHistoryOldVersionId: annotationHistory.oldVersionId,
    otherClientThreadId: otherClientThread.id,
    selectedBaseVersionId: annotation.selectedBaseVersionId,
    balancedTripletVersionId: triplet.tripletVersionIds[1] ?? triplet.tripletVersionIds[0],
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

/**
 * Staging pilot bootstrap: tester entitlements + graduation sample data.
 *
 * Usage:
 *   npx tsx scripts/seed-dev-admin.ts --repair --create
 *   npx tsx scripts/seed-goal-agent-pilot.ts
 *   npx tsx scripts/snapshot-goal-agent-graduation.ts
 */
import "./load-env";
import { count, eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { assistantGoalRuns, user, workspaceMembers } from "../src/server/db/schema";
import { grantTesterEntitlement } from "../src/server/repositories/entitlements";
import {
  createClientProfile,
  getClientProfiles,
} from "../src/server/repositories/client-reference";
import {
  createAssistantThread,
} from "../src/server/repositories/assistant-thread";
import {
  createGoalRun,
  updateGoalRun,
} from "../src/server/repositories/assistant-goal";
import { computeGraduationReport } from "../src/server/assistant/goal/analytics";

const DEV_EMAIL = process.env.PILOT_OWNER_EMAIL ?? "dev-admin@adscale.local";
const PILOT_CLIENT_PREFIX = "Goal Agent Pilot Client";

async function resolveOwner() {
  const account = await db
    .select()
    .from(user)
    .where(eq(user.email, DEV_EMAIL))
    .limit(1);
  if (!account[0]) {
    throw new Error(`No user ${DEV_EMAIL}. Run seed-dev-admin.ts first.`);
  }
  const membership = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, account[0].id))
    .limit(1);
  if (!membership[0]) {
    throw new Error(`User ${DEV_EMAIL} has no workspace.`);
  }
  return {
    userId: account[0].id,
    email: account[0].email,
    workspaceId: membership[0].workspaceId,
  };
}

async function ensurePilotClient(workspaceId: string, index: number) {
  const name = `${PILOT_CLIENT_PREFIX} ${index}`;
  const profiles = await getClientProfiles(workspaceId);
  const existing = profiles.find((profile) => profile.name === name);
  if (existing) return existing;
  return createClientProfile(workspaceId, { name });
}

async function seedGraduationSample(input: {
  workspaceId: string;
  userId: string;
  clientIds: string[];
}) {
  const existing = await db
    .select({ total: count() })
    .from(assistantGoalRuns)
    .where(eq(assistantGoalRuns.workspaceId, input.workspaceId));
  if ((existing[0]?.total ?? 0) >= 20) {
    console.log("Graduation sample already present — skipping seed.");
    return;
  }

  let started = 0;
  let completed = 0;

  for (let i = 0; i < 22; i += 1) {
    const clientProfileId = input.clientIds[i % input.clientIds.length]!;
    const thread = await createAssistantThread(input.workspaceId, {
      clientProfileId,
      name: `Pilot objective ${i + 1}`,
    });
    const goal = await createGoalRun({
      workspaceId: input.workspaceId,
      clientProfileId,
      threadId: thread.id,
      userId: input.userId,
      objective: `Objetivo piloto ${i + 1}`,
    });
    started += 1;
    const shouldComplete = i < 14;
    if (shouldComplete) {
      await updateGoalRun({
        goalRunId: goal.id,
        workspaceId: input.workspaceId,
        clientProfileId,
        threadId: thread.id,
        expectedRevision: goal.revision,
        patch: {
          stage: "completed",
          completedAt: new Date(),
          blockers: [],
        },
      });
      completed += 1;
    } else if (i === 20) {
      await updateGoalRun({
        goalRunId: goal.id,
        workspaceId: input.workspaceId,
        clientProfileId,
        threadId: thread.id,
        expectedRevision: goal.revision,
        patch: { stage: "stopped", stoppedAt: new Date() },
      });
    }
  }

  console.log(`Seeded ${started} objectives (${completed} completed).`);
}

async function main() {
  const owner = await resolveOwner();
  await grantTesterEntitlement({
    workspaceId: owner.workspaceId,
    grantedByUserId: owner.userId,
    grantedByEmail: owner.email,
    notes: "goal-agent pilot bootstrap",
  });

  const clients = await Promise.all([
    ensurePilotClient(owner.workspaceId, 1),
    ensurePilotClient(owner.workspaceId, 2),
    ensurePilotClient(owner.workspaceId, 3),
  ]);

  await seedGraduationSample({
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    clientIds: clients.map((client) => client.id),
  });

  const startedRows = await db.select().from(assistantGoalRuns);
  const completedRows = startedRows.filter((row) => row.stage === "completed");
  const distinctClients = new Set(startedRows.map((row) => row.clientProfileId));

  const report = computeGraduationReport({
    startedObjectives: startedRows.length,
    completedObjectives: completedRows.length,
    distinctClients: distinctClients.size,
    criticalCreditFailures: 0,
    criticalScopeFailures: 0,
    stageDropoff: {
      stopped: startedRows.filter((row) => row.stage === "stopped").length,
    },
  });

  console.log("Pilot bootstrap complete.");
  console.log(JSON.stringify(report, null, 2));
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);

/**
 * #417: agent selection through the real stack (unmocked repository).
 *
 * The repository used to return the bare output row when `effects` was an
 * empty array, while `selectCreativeWorkOutputCommand` unconditionally reads
 * `selection.enqueued` — so every agent selection (zero requested effects)
 * crashed with `TypeError: Cannot read properties of undefined (reading
 * 'map')` before tracing ran. Unit tests masked it because the repository
 * is mocked there. This file proves the real stack instead: ok result,
 * journal-observable confirmation, zero approved value rows.
 *
 * Requires a migrated test database:
 *   npm run test:db:setup
 *   DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test \
 *   npm test -- src/server/application/select-creative-work-output-agent.pg.test.ts
 */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  betaAnalyticsEvents,
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  workspaces,
} from "../db/schema";
import { selectCreativeWorkOutputCommand } from "./select-creative-work-output";
import { getSelectionEffectsForOutput } from "../repositories/selection-effects";
import {
  flushDiagnosticEvents,
  listDiagnosticEvents,
} from "../diagnostics/journal";

const TEST_DB_EXPLICITLY_CONFIGURED = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);
const RUN_ID = `417-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;

type Scope = { userId: string; workspaceId: string; clientProfileId: string };

async function createScope(tag: string): Promise<Scope> {
  seq += 1;
  const name = `t-${RUN_ID}-${tag}-${seq}`;
  const userId = `user-${name}`;
  await db.insert(user).values({
    id: userId,
    name: "Agent417",
    email: `${name}@example.com`,
    emailVerified: true,
  });
  const [workspace] = await db
    .insert(workspaces)
    .values({ name, slug: name })
    .returning();
  const [profile] = await db
    .insert(clientProfiles)
    .values({ workspaceId: workspace.id, name })
    .returning();
  return { userId, workspaceId: workspace.id, clientProfileId: profile.id };
}

async function createWork(scope: Scope) {
  seq += 1;
  const [work] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      createdByUserId: scope.userId,
      title: `agent-417 work ${seq}`,
      request: "Peça única de teste de seleção por agente",
      toolKind: "single",
      status: "draft",
      format: "4:5",
      brief: {
        theme: "Peça única de teste",
        objective: "Provar seleção por agente",
        audience: "Dono da plataforma",
        offer: "Diagnóstico",
      },
      settings: { targetFormats: [] },
    })
    .returning();
  return work;
}

async function createOutput(scope: Scope, work: { id: string }) {
  seq += 1;
  const [output] = await db
    .insert(creativeWorkOutputs)
    .values({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      creativeLevel: "balanced",
      targetFormat: "4:5",
      operationKey: `op-${RUN_ID}-${seq}`,
      status: "completed",
      outputKey: `agent-417/${RUN_ID}/out-${seq}.png`,
      quality: {
        schemaVersion: 1,
        objectiveVerdict: "pass",
      } as Record<string, unknown>,
    })
    .returning();
  return output;
}

describe.skipIf(!TEST_DB_EXPLICITLY_CONFIGURED)(
  "agent selection through the real stack (#417)",
  () => {
    it("succeeds with zero effects: ok result, journaled, no value rows", async () => {
      const scope = await createScope("select-agent");
      const work = await createWork(scope);
      const output = await createOutput(scope, work);

      const result = await selectCreativeWorkOutputCommand({
        workspaceId: scope.workspaceId,
        workItemId: work.id,
        outputId: output.id,
        selectedBy: "agent",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.output.isSelected).toBe(true);
      expect(result.value.output.selectedBy).toBe("agent");
      expect(result.value.effects).toEqual({
        library: { status: "not_requested" },
        valueEvent: { status: "not_requested" },
        recipe: { status: "not_requested" },
      });
      expect(
        await getSelectionEffectsForOutput(db, {
          workspaceId: scope.workspaceId,
          workItemId: work.id,
          outputId: output.id,
        }),
      ).toHaveLength(0);

      await flushDiagnosticEvents();
      const { events, nextCursor } = await listDiagnosticEvents({
        workspaceId: scope.workspaceId,
        workItemId: work.id,
      });
      expect(nextCursor).toBeNull();
      expect(events).toHaveLength(1);
      const [confirmed] = events;
      expect(confirmed.event).toBe("selection.confirmed");
      expect(confirmed.stage).toBe("selection");
      expect(confirmed.status).toBe("completed");
      expect(confirmed.attributes).toEqual({
        "selection.selected_by": "agent",
        "selection.human_approval": false,
        "selection.effects_requested": 0,
      });
      expect(confirmed.context?.outputId).toBe(output.id);

      const approved = await db
        .select()
        .from(betaAnalyticsEvents)
        .where(
          and(
            eq(betaAnalyticsEvents.workspaceId, scope.workspaceId),
            eq(betaAnalyticsEvents.eventKey, "creative_work_approved"),
          ),
        );
      expect(approved).toHaveLength(0);
    });
  },
);

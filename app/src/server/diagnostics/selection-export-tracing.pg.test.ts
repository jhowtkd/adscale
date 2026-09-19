/**
 * trace-390: selection/export tracing against real Postgres.
 *
 * Durability criteria — selection.confirmed persisted with approval truth,
 * selection.effect.failed alongside it without rewriting it, repeated
 * downloads as distinct export operations without new Peças or a second
 * delivered value event, timeline order across selection/export stages,
 * eventId uniqueness, pilot gating — are proven here, never with mocks.
 * (Object storage is stubbed: signed URLs are not a journal criterion.)
 *
 * Requires a migrated test database (migrations 0109 + 0110):
 *   DATABASE_URL=postgres://<user>@localhost:5432/adscale_test npm test -- src/server/diagnostics/selection-export-tracing.pg.test.ts
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/storage", () => ({
  objectStorage: {
    signedDownloadUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
    head: vi.fn(async () => null),
    get: vi.fn(),
    put: vi.fn(),
    putStream: vi.fn(),
  },
}));

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  betaAnalyticsEvents,
  campaigns,
  clientProfiles,
  creativeWorkItems,
  creativeWorkOutputs,
  user,
  workspaces,
} from "../db/schema";
import { selectCreativeWorkOutputCommand } from "../application/select-creative-work-output";
import { resolveCreativeWorkOutputDownload } from "../application/resolve-creative-work-output-download";
import { traceExportServed } from "./selection-export-tracing";
import {
  emitDiagnosticEvent,
  flushDiagnosticEvents,
  listDiagnosticEvents,
} from "./journal";

const RUN_ID = `390-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let seq = 0;

type Scope = { userId: string; workspaceId: string; clientProfileId: string };

async function createScope(tag: string): Promise<Scope> {
  seq += 1;
  const name = `t-${RUN_ID}-${tag}-${seq}`;
  const userId = `user-${name}`;
  await db.insert(user).values({
    id: userId,
    name: "Trace390",
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

const TEST_BRIEF = {
  theme: "Peça única de teste",
  objective: "Provar rastreabilidade",
  audience: "Dono da plataforma",
  offer: "Diagnóstico",
};

async function createWork(
  scope: Scope,
  overrides: {
    toolKind?: string;
    campaignId?: string | null;
    title?: string;
  } = {},
) {
  seq += 1;
  const [work] = await db
    .insert(creativeWorkItems)
    .values({
      workspaceId: scope.workspaceId,
      clientProfileId: scope.clientProfileId,
      createdByUserId: scope.userId,
      title: overrides.title ?? `trace-390 work ${seq}`,
      request: "Peça única de teste de rastreabilidade",
      toolKind: (overrides.toolKind ?? "single") as "single",
      status: "draft",
      format: "4:5",
      brief: TEST_BRIEF,
      settings: { targetFormats: [] },
      ...(overrides.campaignId !== undefined ? { campaignId: overrides.campaignId } : {}),
    })
    .returning();
  return work;
}

async function createOutput(
  scope: Scope,
  work: { id: string },
  overrides: { outputKey?: string; quality?: unknown } = {},
) {
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
      outputKey: overrides.outputKey ?? `trace-390/${RUN_ID}/out-${seq}.png`,
      quality: (overrides.quality ?? {
        schemaVersion: 1,
        objectiveVerdict: "pass",
      }) as Record<string, unknown>,
    })
    .returning();
  return output;
}

async function journalFor(scope: Scope, workItemId: string) {
  await flushDiagnosticEvents();
  return listDiagnosticEvents({
    workspaceId: scope.workspaceId,
    workItemId,
  });
}

async function outputCount(scope: Scope, workItemId: string): Promise<number> {
  const rows = await db
    .select({ id: creativeWorkOutputs.id })
    .from(creativeWorkOutputs)
    .where(
      and(
        eq(creativeWorkOutputs.workspaceId, scope.workspaceId),
        eq(creativeWorkOutputs.workItemId, workItemId),
      ),
    );
  return rows.length;
}

async function valueEvents(
  scope: Scope,
  eventKey: string,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .select()
    .from(betaAnalyticsEvents)
    .where(
      and(
        eq(betaAnalyticsEvents.workspaceId, scope.workspaceId),
        eq(betaAnalyticsEvents.eventKey, eventKey),
      ),
    );
  return rows.map((row) => row.properties);
}

describe("trace-390 journal proofs against Postgres", () => {
  it("persists selection.confirmed with human approval truth and no new Peça", async () => {
    const scope = await createScope("select-ok");
    const work = await createWork(scope);
    const output = await createOutput(scope, work);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      outputId: output.id,
      saveToLibrary: false,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { effects: { valueEvent: { status: "done" } } },
    });
    const { events, nextCursor } = await journalFor(scope, work.id);
    expect(nextCursor).toBeNull();
    expect(events).toHaveLength(1);
    const [confirmed] = events;
    expect(confirmed.event).toBe("selection.confirmed");
    expect(confirmed.stage).toBe("selection");
    expect(confirmed.status).toBe("completed");
    expect(confirmed.attributes).toEqual({
      "selection.selected_by": "operator",
      "selection.human_approval": true,
      "selection.effects_requested": 1,
    });
    expect(confirmed.context?.outputId).toBe(output.id);
    expect(await outputCount(scope, work.id)).toBe(1);
    const approved = await valueEvents(scope, "creative_work_approved");
    expect(approved).toHaveLength(1);
  });

  it("keeps approval truth when a later follow-up effect fails", async () => {
    const scope = await createScope("select-fail");
    const foreign = await createScope("select-fail-foreign");
    const [foreignCampaign] = await db
      .insert(campaigns)
      .values({ workspaceId: foreign.workspaceId, name: `foreign-${RUN_ID}` })
      .returning();
    // FK-valid but owned elsewhere: the value sink fails ownership at runtime.
    const work = await createWork(scope, { campaignId: foreignCampaign.id });
    const output = await createOutput(scope, work);

    const result = await selectCreativeWorkOutputCommand({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      outputId: output.id,
      saveToLibrary: false,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        output: { isSelected: true },
        effects: { valueEvent: { status: "pending" } },
      },
    });
    const { events } = await journalFor(scope, work.id);
    expect(events).toHaveLength(2);
    const byName = new Map(events.map((event) => [event.event, event]));
    const confirmed = byName.get("selection.confirmed");
    const failed = byName.get("selection.effect.failed");
    expect(confirmed?.status).toBe("completed");
    expect(confirmed?.attributes).toMatchObject({
      "selection.selected_by": "operator",
      "selection.human_approval": true,
    });
    expect(failed?.stage).toBe("selection");
    expect(failed?.status).toBe("failed");
    expect(failed?.context?.operationId).toBe(confirmed?.context?.operationId);
    expect(failed?.attributes).toEqual({
      "effect.kind": "value_event",
      "effect.id": expect.any(String),
      "effect.code": "invalid_campaign",
      "effect.phase": "run",
      "effect.retryable": true,
    });
    // Approval truth is not rewritten by the downstream fault.
    expect(await outputCount(scope, work.id)).toBe(1);
    const approved = await valueEvents(scope, "creative_work_approved");
    expect(approved).toHaveLength(0);
  });

  // NOTE (trace-390): an agent end-to-end case belongs here — agent selection
  // journaled with human_approval:false and no value event — but the base
  // crashes first: with zero requested effects the repository returns the
  // bare output (repositories/creative-work.ts: `if (!options.effects ||
  // options.effects.length === 0) return selected;`) while the command
  // assumes `{ output, enqueued }` (`selection.enqueued.map`). Every agent
  // selection through the real stack throws before tracing runs. Fixing the
  // selection return shape is outside this ticket (selection behavior is
  // frozen for #390), so the agent distinction is proven at the adapter
  // level (selection-export-tracing.test.ts) and the command level with a
  // mocked repository (select-creative-work-output.test.ts). Re-add the
  // end-to-end agent case once the base return shape is fixed.

  it("treats repeated downloads as new export operations without new Peças", async () => {
    const scope = await createScope("download-repeat");
    const work = await createWork(scope);
    const output = await createOutput(scope, work);
    const input = {
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      outputId: output.id,
      actorUserId: scope.userId,
    };

    const first = await resolveCreativeWorkOutputDownload(input);
    const second = await resolveCreativeWorkOutputDownload(input);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.outputKey).toBe(output.outputKey);
    expect(second.value.outputKey).toBe(output.outputKey);
    expect(first.value.traceContext?.operationId).not.toBe(
      second.value.traceContext?.operationId,
    );
    // The HTTP adapter serves each prepared export on the same operation.
    traceExportServed({ context: first.value.traceContext ?? null, servedAs: "redirect" });
    traceExportServed({ context: second.value.traceContext ?? null, servedAs: "json" });

    const { events } = await journalFor(scope, work.id);
    expect(events).toHaveLength(4);
    const prepared = events.filter((event) => event.event === "export.prepared");
    const served = events.filter((event) => event.event === "export.served");
    expect(prepared).toHaveLength(2);
    expect(served).toHaveLength(2);
    const eventIds = events.map((event) => event.eventId);
    expect(new Set(eventIds).size).toBe(4);
    const operations = prepared.map((event) => event.context?.operationId);
    expect(new Set(operations).size).toBe(2);
    for (const serve of served) {
      const pair = prepared.find(
        (prep) => prep.context?.operationId === serve.context?.operationId,
      );
      expect(pair).toBeDefined();
    }
    expect(served.map((event) => event.attributes?.["export.served_as"]).sort()).toEqual([
      "json",
      "redirect",
    ]);
    // No new Peças, and the single-delivery value event fired exactly once.
    expect(await outputCount(scope, work.id)).toBe(1);
    const delivered = await valueEvents(scope, "creative_work_delivered");
    expect(delivered).toHaveLength(1);
  });

  it("continues the timeline through selection and export stages", async () => {
    const scope = await createScope("timeline");
    const work = await createWork(scope);
    const output = await createOutput(scope, work);

    // An earlier image-stage record anchors "image ready" in the past.
    await emitDiagnosticEvent({
      eventId: `evt-390-${RUN_ID}-image`,
      event: "stage.completed",
      schemaVersion: 1,
      occurredAt: "2026-09-01T12:00:00.000Z",
      recordedAt: "2026-09-01T12:00:00.005Z",
      stage: "image",
      status: "completed",
      correlation: "full",
      context: {
        schemaVersion: 1,
        workspaceId: scope.workspaceId,
        clientProfileId: scope.clientProfileId,
        workItemId: work.id,
        protocol: "single",
        operationId: `op-390-${RUN_ID}-image`,
        outputId: output.id,
        releaseSha: "test-sha",
        environment: "test",
        process: "worker",
        dataOrigin: "test",
      },
    });
    const selected = await selectCreativeWorkOutputCommand({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      outputId: output.id,
      saveToLibrary: false,
    });
    expect(selected.ok).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const downloaded = await resolveCreativeWorkOutputDownload({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      outputId: output.id,
      actorUserId: scope.userId,
    });
    expect(downloaded.ok).toBe(true);
    // Separate wall-clock instants: same-millisecond events order by id.
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (downloaded.ok) {
      traceExportServed({
        context: downloaded.value.traceContext ?? null,
        servedAs: "redirect",
      });
    }

    const { events } = await journalFor(scope, work.id);
    expect(events).toHaveLength(4);
    const timeline = events;
    expect(timeline.map((event) => event.event)).toEqual([
      "stage.completed",
      "selection.confirmed",
      "export.prepared",
      "export.served",
    ]);
    expect(timeline.map((event) => event.stage)).toEqual([
      "image",
      "selection",
      "export",
      "export",
    ]);
    const operations = timeline.map((event) => event.context?.operationId);
    expect(new Set(operations).size).toBe(3);
    expect(operations[2]).toBe(operations[3]);
  });

  it("stays silent outside the Peça única pilot", async () => {
    const scope = await createScope("silent");
    const work = await createWork(scope, { toolKind: "social_post" });
    const output = await createOutput(scope, work);

    const selected = await selectCreativeWorkOutputCommand({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      outputId: output.id,
      saveToLibrary: false,
    });
    expect(selected.ok).toBe(true);
    const downloaded = await resolveCreativeWorkOutputDownload({
      workspaceId: scope.workspaceId,
      workItemId: work.id,
      outputId: output.id,
      actorUserId: scope.userId,
    });
    expect(downloaded.ok).toBe(true);
    if (downloaded.ok) {
      expect(downloaded.value.traceContext).toBeUndefined();
    }

    const { events } = await journalFor(scope, work.id);
    expect(events).toHaveLength(0);
    // Business behavior is unchanged outside the pilot.
    expect(await outputCount(scope, work.id)).toBe(1);
    expect(await valueEvents(scope, "creative_work_approved")).toHaveLength(1);
    expect(await valueEvents(scope, "creative_work_delivered")).toHaveLength(1);
  });
});

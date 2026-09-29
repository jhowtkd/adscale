import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { FailureEventPayload } from "inngest";
import type { CommandSuccess } from "./shared";
import { resolveEquipeTestDatabaseUrl } from "../data/test-database";

const TEST_DATABASE_URL = resolveEquipeTestDatabaseUrl();
if (TEST_DATABASE_URL) process.env.DATABASE_URL = TEST_DATABASE_URL;

// Only external boundaries are faked. Guards, membership reads, routes,
// module commands, conversation storage and job handlers below are real.
vi.mock("@/server/auth/session", () => ({ getSessionFromHeaders: vi.fn(), getSession: vi.fn() }));
vi.mock("@/server/equipe/http/deps", () => ({ createEquipeRouteDeps: vi.fn() }));
vi.mock("@/server/equipe/module/equipe-enabled", () => ({ isEquipeEnabledForWorkspace: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/server/assistant/orchestrator", () => ({
  runAssistantTurn: () => { throw new Error("unexpected classic turn"); },
}));
vi.mock("@/server/assistant/goal/orchestrator-loop", () => ({
  runGoalAgentTurn: () => { throw new Error("unexpected goal turn"); },
}));

const workspaceIds: string[] = [];
const userIds: string[] = [];
const staffIds: string[] = [];

async function database() {
  const [{ db }, schema, staffSchema] = await Promise.all([
    import("@/server/db"), import("@/server/db/schema"), import("@/server/db/equipe-schema"),
  ]);
  return { db, schema, staffSchema };
}

afterAll(async () => {
  vi.restoreAllMocks();
  if (!TEST_DATABASE_URL) return;
  const { db, schema, staffSchema } = await database();
  for (const id of staffIds) await db.delete(staffSchema.equipeStaff).where(eq(staffSchema.equipeStaff.id, id));
  for (const id of workspaceIds) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, id));
  for (const id of userIds) await db.delete(schema.user).where(eq(schema.user.id, id));
});

function request(userId: string, workspaceId: string, path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-test-user": userId, cookie: `adscale_active_workspace=${workspaceId}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

type WorkEvent = { id: string; name: string; data: { workspaceId: string; accountId: string; sourceEventId: string; kind: string } };
type Conversation = { messages: Array<{ id: string; type: string; content: string; payload: Record<string, unknown> }> };

describe.skipIf(!TEST_DATABASE_URL)("jornada HTTP e jobs Equipe em Postgres", () => {
  it("abre pelo console, isola o cliente, conversa, revisa via outbox, projeta mensagens e escala a falha", async () => {
    const { db, schema } = await database();
    const [session, routeDeps, gate, { createPostgresEquipeUnitOfWork }, { makeTestDeps }, { executeCommand },
      { getItemDetail }, { postProactiveMessage }, runner, { FakeModelClient }, { MemoryLedgerStore },
      staffRoute, clientRoute, threadsRoute, threadRoute, chatRoute, { createAgentWorkOutboxHandler }, workJob, { inngest }] = await Promise.all([
      import("@/server/auth/session"), import("../http/deps"), import("./equipe-enabled"), import("../data/postgres"),
      import("./testing/deps"), import("./commands"), import("./queries"), import("../agents/proactive"),
      import("../agents/runner"), import("../agents/testing"), import("../agents/ledger"),
      import("@/app/api/equipe/staff/commands/route"), import("@/app/api/equipe/accounts/[accountId]/commands/route"),
      import("@/app/api/assistant/threads/route"), import("@/app/api/assistant/threads/[threadId]/route"),
      import("@/app/api/assistant/threads/[threadId]/chat/route"), import("../jobs/agent-work-outbox"),
      import("../agents/agent-work"), import("@/server/jobs/client"),
    ]);
    const uow = createPostgresEquipeUnitOfWork(db);
    const t = makeTestDeps();
    t.deps.uow = uow;
    vi.mocked(routeDeps.createEquipeRouteDeps).mockReturnValue(t.deps);
    const tag = `jornada591-${crypto.randomUUID()}`;
    const clientUser = `client-${tag}`;
    const staffUser = `staff-${tag}`;
    for (const id of [clientUser, staffUser]) {
      await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com`, emailVerified: true });
      userIds.push(id);
    }
    vi.mocked(session.getSessionFromHeaders).mockImplementation(async (headers) => ({
      user: { id: headers.get("x-test-user"), name: "Jornada", email: "jornada@example.com" },
    }) as never);
    const [workspace] = await db.insert(schema.workspaces).values({ name: tag, slug: tag }).returning();
    const [staffWorkspace] = await db.insert(schema.workspaces).values({ name: `staff-${tag}`, slug: `staff-${tag}` }).returning();
    workspaceIds.push(workspace.id, staffWorkspace.id);
    await db.insert(schema.workspaceMembers).values([
      { workspaceId: workspace.id, userId: clientUser, role: "owner" },
      { workspaceId: staffWorkspace.id, userId: staffUser, role: "owner" },
    ]);
    vi.mocked(gate.isEquipeEnabledForWorkspace).mockImplementation((id) => id === workspace.id);
    const [profile] = await db.insert(schema.clientProfiles).values({ workspaceId: workspace.id, name: tag }).returning();
    const [otherBrand] = await db.insert(schema.clientProfiles).values({ workspaceId: workspace.id, name: `other-${tag}` }).returning();
    t.gateway.addProfile({ id: profile.id, workspaceId: workspace.id, name: tag });
    const operations = await uow.internal.staff.create({ role: "operations", displayName: "Operações", userId: staffUser, active: true });
    const support = await uow.internal.staff.create({ role: "support", displayName: "Bruna", userId: staffUser, active: true });
    staffIds.push(operations.id, support.id);

    // Same endpoint/body as OpenAccountDialog. No assistant/equipe thread is seeded.
    const opened = await staffRoute.POST(request(staffUser, staffWorkspace.id, "/api/equipe/staff/commands", {
      workspaceId: workspace.id, role: "operations", type: "open_account",
      payload: { clientProfileId: profile.id, fronts: ["social_instagram"], people: [
        { name: "Ana", role: "approver", userId: clientUser }, { name: "Carla", role: "substitute" },
        { name: "Cid", role: "custodian" }, { name: "Rui", role: "member" },
      ] },
    }));
    expect(opened.status).toBe(200);
    const openedBody = await opened.json() as CommandSuccess;
    const accountId = openedBody.accountId;
    const scope = { workspaceId: workspace.id, accountId };
    const assistantThreadId = openedBody.data.assistantThreadId as string;
    const threadParams = { params: Promise.resolve({ threadId: assistantThreadId }) };
    const threadPath = `/api/assistant/threads/${assistantThreadId}`;
    const listPath = `/api/assistant/threads?clientProfileId=${profile.id}&campaignId=null`;
    expect(openedBody.events.find((event) => event.eventType === "account.opened")).toMatchObject({ actorType: "staff", actorId: operations.id });
    const threads = await threadsRoute.GET(request(clientUser, workspace.id, listPath));
    expect(await threads.json()).toMatchObject({ threads: [{ id: assistantThreadId, workspaceId: workspace.id, clientProfileId: profile.id }] });
    const wrongBrand = await threadsRoute.GET(request(clientUser, workspace.id, `/api/assistant/threads?clientProfileId=${otherBrand.id}`));
    expect(await wrongBrand.json()).toEqual({ threads: [] });
    // Even a forged active-workspace cookie cannot make platform staff a member.
    const staffList = await threadsRoute.GET(request(staffUser, workspace.id, listPath));
    expect(await staffList.json()).toEqual({ threads: [] });
    const denied = await threadRoute.GET(request(staffUser, workspace.id, threadPath), threadParams);
    expect(denied.status).toBe(404);
    const maps = await uow.repos.threads.list(scope);
    expect(maps).toHaveLength(1);
    const ensured = await executeCommand(t.deps, { actor: { kind: "agent", agentId: "estrategista" }, ...scope }, {
      type: "ensure_primary_thread", payload: {},
    });
    expect(ensured.ok && ensured.value.data).toMatchObject({ assistantThreadId, created: false });

    const client = new FakeModelClient([
      { content: "Conta aberta, pronto para ajudar." },
      { content: JSON.stringify({ findings: [], summary: "Pronto para decisão.", natures: ["none"] }) },
      { content: JSON.stringify({ findings: [{ severity: "blocking", area: "factual", message: "Promessa sem fonte", suggestion: null }], summary: "Corrigir promessa.", natures: ["none"] }) },
    ]);
    const agents = runner.createEquipeAgents({ moduleDeps: t.deps, client, ledger: new MemoryLedgerStore() });
    vi.spyOn(runner, "createEquipeAgents").mockReturnValue(agents);
    const chat = await chatRoute.POST(request(clientUser, workspace.id, `${threadPath}/chat`, { message: "Como começamos?" }), threadParams);
    expect(chat.status).toBe(200);
    const stream = await chat.text();
    expect(stream).toContain("Conta aberta, pronto para ajudar.");
    expect(stream).toContain("event: done");
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]?.tools?.some((tool) => tool.name === "get_account_state")).toBe(true);

    const command = async (type: string, payload: unknown): Promise<CommandSuccess> => {
      const res = await clientRoute.POST(request(clientUser, workspace.id, `/api/equipe/accounts/${accountId}/commands`, { type, payload }),
        { params: Promise.resolve({ accountId }) });
      expect(res.status).toBe(200);
      return res.json();
    };
    const front = (await uow.repos.fronts.list(scope))[0]!;
    const [work] = await db.insert(schema.creativeWorkItems).values({
      workspaceId: workspace.id, clientProfileId: profile.id, createdByUserId: clientUser,
      title: "Jornada", request: "Peça de teste", toolKind: "variations", status: "ready", format: "4:5", settings: { targetFormats: [] },
    }).returning();
    const [output] = await db.insert(schema.creativeWorkOutputs).values({
      workspaceId: workspace.id, workItemId: work.id, creativeLevel: "balanced", targetFormat: "4:5",
      versionNumber: 1, operationKey: tag, status: "completed", outputKey: `creative-work/${tag}/original.png`,
    }).returning();
    t.gateway.works.set(work.id, { id: work.id, workspaceId: workspace.id });
    t.gateway.addOutput({ id: output.id, workspaceId: workspace.id, workId: work.id });
    const delivered = await executeCommand(t.deps, { actor: { kind: "agent", agentId: "estrategista" }, ...scope }, {
      type: "deliver_batch", payload: { title: "Lote", frontId: front.id, approveByAt: new Date("2026-10-07T17:00:00.000Z"), items: [
        { creativeWorkId: work.id, creativeWorkOutputId: output.id, caption: "Legenda", destinationAccount: "instagram:@brand",
          scheduledFor: new Date("2026-10-09T12:00:00.000Z"), needsConfirmation: false },
      ] },
    });
    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    const itemId = delivered.value.data.itemIds[0] as string;
    const step = { run: async <T>(_name: string, fn: () => Promise<T>) => fn() };
    const runtime = { depsFor: () => t.deps, agentsFor: () => agents, isEnabled: (id: string) => id === workspace.id };
    const handleWork = workJob.createAgentWorkHandler(runtime);
    const outbox = createAgentWorkOutboxHandler({ uow, clock: t.deps.clock, isEnabledForWorkspace: runtime.isEnabled, gatewayFor: () => t.gateway });
    const emit = async () => {
      const events: WorkEvent[] = [];
      await outbox({ step: { ...step, sendEvent: async (_name, event) => { events.push(event); } } });
      return events;
    };
    for (const [caption, expected] of [["Legenda editada", "ready"], ["Promessa nova", "blocked"]]) {
      const edit = await command("edit_caption", { itemId, caption });
      const source = edit.events.find((event) => event.eventType === "agent_work.requested")!;
      const emitted = await emit();
      expect(emitted).toHaveLength(1);
      expect(emitted[0]).toMatchObject({ id: `${source.id}:0`, name: "equipe.agent.work", data: { ...scope, sourceEventId: source.id, kind: "caption_revalidation" } });
      await handleWork({ event: emitted[0]!, step, runId: `run-${source.id}` });
      const calls = client.requests.length;
      await handleWork({ event: emitted[0]!, step, runId: `redelivery-${source.id}` });
      expect(client.requests).toHaveLength(calls);
      expect(await emit()).toHaveLength(0);
      const detail = await getItemDetail(uow.repos, workspace.id, accountId, itemId);
      expect(detail?.review.status).toBe(expected);
      expect(detail?.findings.find((version) => version.versionHash === edit.data.versionHash)?.findings.findings).toHaveLength(expected === "ready" ? 0 : 1);
      expect(await uow.repos.receipts.list(scope)).toHaveLength(0);
      expect(await uow.repos.intents.list(scope)).toHaveLength(0);
    }

    const supportRequest = await command("request_support", { note: "Preciso de ajuda" });
    const posted = await staffRoute.POST(request(staffUser, staffWorkspace.id, "/api/equipe/staff/commands", {
      ...scope, role: "support", type: "post_staff_message",
      payload: { exceptionId: supportRequest.data.exceptionId, body: "Vou ajudar por aqui." },
    }));
    expect(posted.status).toBe(200);
    const batchEvent = delivered.value.events.find((event) => event.eventType === "batch.delivered")!;
    // Independent transactions test redelivery; never parallel queries in one tx.
    await Promise.all([1, 2].map(() => postProactiveMessage({ deps: t.deps, ...scope, sourceEventId: batchEvent.id })));
    const conversation = await threadRoute.GET(request(clientUser, workspace.id, threadPath), threadParams);
    expect(conversation.status).toBe(200);
    const body = await conversation.json() as Conversation;
    expect(body.messages).toContainEqual(expect.objectContaining({ type: "assistant", content: "Conta aberta, pronto para ajudar." }));
    expect(body.messages).toContainEqual(expect.objectContaining({ type: "staff_message", content: "Vou ajudar por aqui.", payload: { staffId: support.id, name: "Bruna" } }));
    expect(body.messages.filter((message) => message.id === batchEvent.id)).toHaveLength(1);
    expect(body.messages.find((message) => message.id === batchEvent.id)).toMatchObject({ type: "equipe_card", payload: { actor: "agent", actorId: "estrategista" } });

    // The fake is deliberately exhausted: the real handler fails before apply.
    const failingEdit = await command("edit_caption", { itemId, caption: "Legenda para falha simulada" });
    const failedSource = failingEdit.events.find((event) => event.eventType === "agent_work.requested")!;
    const [failedEvent] = await emit();
    await expect(handleWork({ event: failedEvent!, step, runId: "failed-run-591" })).rejects.toThrow("fakeModelClientOutOfResponses");
    const job = workJob.buildEquipeAgentWorkJob(inngest, { id: "jornada-failure", eventName: "equipe.agent.work" }, runtime);
    const onFailure = (job as unknown as { opts: { onFailure: (input: { event: FailureEventPayload; error: Error }) => Promise<void> } }).opts.onFailure;
    const failure: FailureEventPayload = {
      name: "inngest/function.failed",
      data: { function_id: "jornada-failure", run_id: "failed-run-591", error: { name: "Error", message: "fakeModelClientOutOfResponses" }, event: failedEvent! },
    };
    await onFailure({ event: failure, error: new Error("fakeModelClientOutOfResponses") });
    await onFailure({ event: failure, error: new Error("fakeModelClientOutOfResponses") });
    expect(await uow.repos.events.list(scope, { eventType: "agent.turn_failed" })).toEqual([
      expect.objectContaining({ objectId: itemId, payload: expect.objectContaining({ sourceEventId: failedSource.id, runId: "failed-run-591" }) }),
    ]);
    expect(await uow.repos.escalations.list(scope)).toEqual([
      expect.objectContaining({ kind: "technical", ownerRole: "operations", status: "open", itemId }),
    ]);

    const newer = await executeCommand(t.deps, { actor: { kind: "agent", agentId: "estrategista" }, ...scope }, {
      type: "submit_item_version", payload: { itemId, expectedVersionHash: failingEdit.data.versionHash, caption: "Novo pedido para concorrência" },
    });
    expect(newer.ok).toBe(true);
    if (!newer.ok) return;
    const source = newer.value.events.find((event) => event.eventType === "agent_work.requested")!;
    const claim = (runId: string) => executeCommand(t.deps, { actor: { kind: "system", job: "pg-claim" }, ...scope }, {
      type: "claim_agent_work", payload: { sourceEventId: source.id, runId },
    });
    const claims = await Promise.all([claim("run-a"), claim("run-b")]);
    expect(claims.every((result) => result.ok)).toBe(true);
    expect(claims.filter((result) => result.ok && result.value.data.claimed === true)).toHaveLength(1);
    expect(claims.filter((result) => result.ok && result.value.data.claimed === false)).toHaveLength(1);
  });
});

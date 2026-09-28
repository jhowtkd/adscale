/**
 * Dev-only demo seed for the internal Equipe consoles (#554).
 *
 * Builds, through MODULE COMMANDS (executeCommand + the platform-owner
 * bootstrap — no raw inserts, no secrets, no network or AI calls), one
 * realistic demo account on an EXISTING workspace + client profile:
 *
 * - the account (fronts social_instagram + midia_paga), `--user` as approver
 *   AND custodian, platform-owner staff rows (support/quality/operations)
 *   for `--staff-user`, and the implantação advanced to calibration;
 * - 7 REAL creative works (Trabalhos), each with one finished output, plus
 *   one material asset — created through the existing creative-work and
 *   workspace-asset repositories and verified for real through the
 *   LiveAdscaleGateway (the module's FKs point at creative_work_items, so
 *   fake ids cannot work);
 * - a calibration round with scored items (one returned for fix and
 *   corrected), plus client decisions on the round (approved, adjusting,
 *   declined, ready);
 * - a second batch with items in several states (ready, needs confirmation,
 *   blocked by a critical escalation);
 * - one open support exception and one critical escalation.
 *
 * Finished outputs carry a placeholder `outputKey` (no bytes are uploaded)
 * and cost 0: exactly one planned output is reserved per work and completed
 * immediately through the repository functions, so nothing stays `queued`
 * where a background dispatcher could pick it up and spend credits.
 *
 * Reachable states only: `scheduled`/`published` have no module-command path
 * yet (connection creation and dispatch live outside the module), so the
 * approved demo item lands on `available_for_download` (manual mode).
 *
 * Usage (from app/):
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/equipe-seed-dev.ts \
 *     --workspace <id> --client-profile <id> \
 *     --user <userId> --staff-user <userId> --i-know-this-writes
 *
 * (The NODE_OPTIONS flag is the repo's standard way to run db scripts with
 * tsx — same as seed:create-post-e2e — since src/server/db is server-only.)
 *
 * Safety: refuses to run with NODE_ENV=production, without DATABASE_URL, or
 * against a production-looking database name, and requires the explicit
 * --i-know-this-writes flag. It prints what it will create before writing.
 * Reads (workspace/profile/user existence) run before any command.
 *
 * Idempotency: if an Equipe account already exists for the (workspace,
 * client-profile) pair, the seed prints its id and stops (exit 0). To force
 * a clean re-run in dev, delete the stale account row — every Equipe child
 * row references it ON DELETE CASCADE (there is no account delete command;
 * this SQL is dev-only):
 *   delete from adscale_equipe.equipe_accounts where id = '<account-id>';
 * Seed Trabalhos stay behind as ordinary workspace rows.
 */
import "./load-env";

import { eq } from "drizzle-orm";
import { db } from "../src/server/db";
import { user as users, workspaces } from "../src/server/db/schema";
import { getClientProfile } from "../src/server/repositories/client-reference";
import { systemClock, type Actor } from "../src/server/equipe/domain";
import { createPostgresEquipeUnitOfWork } from "../src/server/equipe/data/postgres";
import type { EquipeFrontKey } from "../src/server/equipe/data";
import { executeCommand } from "../src/server/equipe/module/commands";
import { ensurePlatformOwnerStaff } from "../src/server/equipe/module/platform-owner-staff";
import { contextVersionHash } from "../src/server/equipe/module/context";
import {
  mandateRuleOf,
  mandateVersionHash,
  planVersionHash,
} from "../src/server/equipe/module/plan-mandate";
import type { EquipeModuleDeps } from "../src/server/equipe/module/ports";
import { LiveAdscaleGateway } from "../src/server/equipe/agents/gateway";
import {
  FakePublisher,
  FixedAgents,
} from "../src/server/equipe/module/testing/fakes";
import {
  completeCreativeWorkOutput,
  createCreativeWork,
  createPlannedCreativeWorkOutputs,
  markCreativeWorkOutputProcessing,
  refreshCreativeWorkStatus,
} from "../src/server/repositories/creative-work";
import { createWorkspaceAsset } from "../src/server/repositories/workspace-asset";
import {
  assertSeedTargetSafe,
  assertWriteFlagPresent,
  parseSeedArgs,
} from "./equipe-seed-dev-guard";

const SEED_AGENT = "equipe-seed-dev";

function daysFromNow(days: number, extraHours = 0): Date {
  return new Date(Date.now() + days * 24 * 3_600_000 + extraHours * 3_600_000);
}

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2));
  const dbName = assertSeedTargetSafe({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });

  console.log(`[seed] database: ${dbName} (NODE_ENV=${process.env.NODE_ENV ?? "unset"})`);
  console.log(`[seed] workspace: ${args.workspace}`);
  console.log(`[seed] client profile: ${args.clientProfile}`);
  console.log(`[seed] user (approver + custodian): ${args.user}`);
  console.log(`[seed] staff user (support/quality/operations): ${args.staffUser}`);
  console.log(
    "[seed] will create: 1 account, 2 fronts, 7 onboarding steps, 7 creative " +
      "works (1 finished output each), 1 material asset, 2 batches " +
      "(4 + 3 items), 2 rounds, 1 critical escalation (+ its linked exception), " +
      "1 standalone open exception",
  );
  assertWriteFlagPresent(args.iKnowThisWrites);

  // Read-only preflight: everything referenced must already exist.
  const workspaceRows = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, args.workspace))
    .limit(1);
  const workspace = workspaceRows[0];
  if (!workspace) throw new Error(`seed: unknown workspace ${args.workspace}`);
  const profile = await getClientProfile(args.workspace, args.clientProfile);
  if (!profile) {
    throw new Error(`seed: unknown client profile ${args.clientProfile} in workspace`);
  }
  for (const userId of [args.user, args.staffUser]) {
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!found[0]) throw new Error(`seed: unknown user ${userId}`);
  }
  console.log(`[seed] brand: ${profile.name} · workspace: ${workspace.name}`);

  const deps: EquipeModuleDeps = {
    uow: createPostgresEquipeUnitOfWork(db),
    clock: systemClock(),
    // Live gateway: the seed creates real Trabalhos/outputs/assets through
    // the app repositories, so the module verifies them for real.
    gateway: new LiveAdscaleGateway(args.workspace),
    agents: new FixedAgents(),
    publisher: new FakePublisher(),
    // Dev seed: the pilot allowlist is an ops concern, not demo data.
    isEnabledForWorkspace: () => true,
  };

  // Idempotent for dev: an existing account for this client profile means a
  // previous run (possibly partial) already owns the pair — print it and
  // stop instead of failing on the workspace/profile unique constraint.
  const preexisting = (await deps.uow.repos.accounts.list(args.workspace)).find(
    (row) => row.clientProfileId === args.clientProfile,
  );
  if (preexisting) {
    console.log(
      `[seed] account already exists for this client profile: ${preexisting.id} ` +
        `(status=${preexisting.status}) — nothing to do`,
    );
    return;
  }
  const system: Actor = { kind: "system", job: SEED_AGENT };
  const agent: Actor = { kind: "agent", agentId: SEED_AGENT };

  async function run(
    type: string,
    actor: Actor,
    payload: Record<string, unknown>,
    accountId?: string,
  ): Promise<Record<string, unknown>> {
    const outcome = await executeCommand(
      deps,
      { actor, workspaceId: args.workspace, ...(accountId ? { accountId } : {}) },
      { type, payload },
    );
    if (!outcome.ok) {
      throw new Error(`seed: ${type} failed (${outcome.error.code}): ${outcome.error.message}`);
    }
    return outcome.value.data as Record<string, unknown>;
  }

  // Staff rows for the platform owner (idempotent bootstrap).
  const staffReport = await ensurePlatformOwnerStaff(deps, system, {
    userId: args.staffUser,
    displayName: "Seed Dono",
  });
  if (!staffReport.ok) {
    throw new Error(`seed: staff bootstrap failed (${staffReport.error.code})`);
  }
  console.log(
    `[seed] staff: created=[${staffReport.value.created.join(",")}] ` +
      `alreadyActive=[${staffReport.value.alreadyActive.join(",")}] ` +
      `deactivated=[${staffReport.value.deactivated.join(",")}]`,
  );
  const staffRows = (await deps.uow.internal.staff.list()).filter(
    (row) => row.userId === args.staffUser && row.active,
  );
  const staffActor = (role: "support" | "quality" | "operations"): Actor => {
    const row = staffRows.find((candidate) => candidate.role === role);
    if (!row) throw new Error(`seed: no active ${role} row for ${args.staffUser}`);
    return { kind: "staff", role, staffId: row.id };
  };
  const support = staffActor("support");
  const quality = staffActor("quality");
  const operations = staffActor("operations");

  // The account: --user as approver AND custodian.
  const opened = await run(
    "open_account",
    operations,
    {
      clientProfileId: args.clientProfile,
      fronts: ["social_instagram", "midia_paga"],
      people: [
        { name: "Aprovadora Demo", role: "approver", userId: args.user },
        { name: "Custodiante Demo", role: "custodian", userId: args.user },
      ],
      notes: "seed dev #554",
    },
  );
  const accountId = opened["accountId"] as string;
  console.log(`[seed] account: ${accountId}`);
  const scope = { workspaceId: args.workspace, accountId };
  const people = await deps.uow.repos.people.list(scope);
  const personActor = (role: "approver" | "custodian"): Actor => {
    const row = people.find((person) => person.role === role);
    if (!row) throw new Error(`seed: missing ${role} person`);
    return { kind: "client_person", role, personId: row.id };
  };
  const approver = personActor("approver");

  // Implantação up to calibration.
  await run("confirm_scope", approver, { scopeDigest: "seed:escopo-demo" }, accountId);
  const seedAsset = await createWorkspaceAsset({
    workspaceId: args.workspace,
    name: "equipe-seed-dev-logo.png",
    key: `equipe-seed-dev/${args.workspace.slice(0, 8)}/${Date.now()}-logo.png`,
    type: "image/png",
    size: 0,
    source: "seed",
    metadata: { seed: SEED_AGENT },
  });
  console.log(`[seed] material asset: ${seedAsset.id}`);
  await run(
    "register_material",
    approver,
    { assetId: seedAsset.id, kind: "logo", origin: "seed" },
    accountId,
  );
  const contextFields = {
    tom: { status: "sustained", value: "direto e próximo" },
    publico: { status: "inferred", value: "25-40, urbano", source: "briefing seed" },
  };
  await run("propose_context_section", agent, { section: "marca", fields: contextFields }, accountId);
  await run(
    "approve_context_section",
    approver,
    { section: "marca", expectedVersionHash: contextVersionHash(contextFields) },
    accountId,
  );
  const planContent = { objetivo: "demo das consoles internas", pecasPorSemana: 4 };
  await run("propose_plan", agent, { content: planContent }, accountId);
  await run(
    "approve_plan",
    approver,
    { expectedVersionHash: planVersionHash(planContent) },
    accountId,
  );
  await run("propose_mandate", agent, { shadow: true, limits: { maxPecas: 10 } }, accountId);
  const mandates = await deps.uow.repos.mandates.list(scope);
  const proposedMandate = mandates
    .filter((row) => row.status === "proposed")
    .sort((a, b) => b.version - a.version)[0];
  if (!proposedMandate) throw new Error("seed: missing proposed mandate");
  await run(
    "approve_mandate",
    approver,
    { expectedVersionHash: mandateVersionHash(mandateRuleOf(proposedMandate)) },
    accountId,
  );
  await run(
    "approve_brand_voice",
    approver,
    { voice: "Voz demo: clara, confiante, sem jargão." },
    accountId,
  );
  await run("agree_manual_mode", approver, {}, accountId);
  await run("record_installment_paid", support, { installment: 1, reference: "seed-1" }, accountId);
  await run("record_installment_paid", support, { installment: 2, reference: "seed-2" }, accountId);
  for (const step of [
    "scope_confirm",
    "materials",
    "context",
    "plan",
    "mandate",
    "connection",
    "go_live",
  ]) {
    await run("advance_onboarding", support, { step }, accountId);
  }
  const account = await deps.uow.repos.accounts.get(args.workspace, accountId);
  if (account?.status !== "calibrating") {
    throw new Error(`seed: expected a calibrating account, got ${account?.status}`);
  }
  console.log("[seed] implantação advanced to calibration");

  const fronts = await deps.uow.repos.fronts.list(scope);
  const frontIdOf = (key: EquipeFrontKey): string => {
    const front = fronts.find((row) => row.key === key);
    if (!front) throw new Error(`seed: missing front ${key}`);
    return front.id;
  };

  // One real Trabalho with one finished output per item, through the app
  // repositories only (no raw SQL, no network, no AI): reserve exactly one
  // planned output, claim it, and complete it with a placeholder outputKey.
  async function createSeedWorkWithOutput(caption: string): Promise<{
    workId: string;
    outputId: string;
  }> {
    const work = await createCreativeWork({
      workspaceId: args.workspace,
      clientProfileId: args.clientProfile,
      createdByUserId: args.user,
      toolKind: "social_post",
      brief: {
        theme: caption,
        objective: "Demo das consoles internas (#554)",
        audience: "",
        offer: null,
      },
      format: "4:5",
    });
    const planned = await createPlannedCreativeWorkOutputs(args.workspace, work.id, [
      { creativeLevel: "balanced", targetFormat: "4:5", versionNumber: 1 },
    ]);
    const output = planned.outputs[0];
    if (!output) throw new Error(`seed: no output reserved for work ${work.id}`);
    const claimed = await markCreativeWorkOutputProcessing(args.workspace, work.id, output.id);
    if (!claimed) throw new Error(`seed: cannot claim output ${output.id} for work ${work.id}`);
    const finished = await completeCreativeWorkOutput(args.workspace, work.id, output.id, {
      outputKey: `equipe-seed-dev/${args.workspace.slice(0, 8)}/${work.id.slice(0, 8)}-balanced.png`,
      cost: 0,
      quality: { seed: SEED_AGENT },
    });
    if (!finished) throw new Error(`seed: cannot complete output ${output.id} for work ${work.id}`);
    await refreshCreativeWorkStatus(args.workspace, work.id);
    return { workId: work.id, outputId: output.id };
  }

  async function deliverDemoBatch(input: {
    title: string;
    front: EquipeFrontKey;
    captions: string[];
    needsConfirmationIndex?: number;
  }): Promise<{ batchId: string; itemIds: string[]; versionHashes: string[] }> {
    const items = [];
    for (const [index, caption] of input.captions.entries()) {
      const pair = await createSeedWorkWithOutput(caption);
      items.push({
        creativeWorkId: pair.workId,
        creativeWorkOutputId: pair.outputId,
        caption,
        destinationAccount: "instagram:@marca.demo",
        scheduledFor: daysFromNow(7, index),
        needsConfirmation: index === input.needsConfirmationIndex,
      });
    }
    console.log(`[seed] batch "${input.title}": ${items.length} real works with finished outputs`);
    const delivered = await run(
      "deliver_batch",
      agent,
      {
        title: input.title,
        frontId: frontIdOf(input.front),
        approveByAt: daysFromNow(3),
        items,
      },
      accountId,
    );
    return {
      batchId: delivered["batchId"] as string,
      itemIds: delivered["itemIds"] as string[],
      versionHashes: delivered["versionHashes"] as string[],
    };
  }

  async function scoreAll(roundId: string, itemIds: string[], fails = 0): Promise<void> {
    for (const [index, itemId] of itemIds.entries()) {
      const rubric =
        index >= itemIds.length - fails
          ? { facts: 2, brand: 2, usefulness: 2, execution: 2 }
          : { facts: 4, brand: 4, usefulness: 3, execution: 4 };
      await run("score_attempt", quality, { roundId, itemId, ...rubric }, accountId);
    }
  }

  async function releaseAll(roundId: string, itemIds: string[]): Promise<void> {
    for (const itemId of itemIds) {
      await run("release_item_to_client", quality, { roundId, itemId }, accountId);
    }
  }

  // Round 1: social (4 items), scored, one returned + corrected, decided.
  const social = await deliverDemoBatch({
    title: "Calibração — semana 1",
    front: "social_instagram",
    captions: [
      "Demo: bastidor da loja na segunda",
      "Demo: oferta da semana no stories",
      "Demo: depoimento de cliente",
      "Demo: tour pelo ateliê",
    ],
  });
  const round1 = (
    await run(
      "open_round",
      agent,
      { frontId: frontIdOf("social_instagram"), batchId: social.batchId },
      accountId,
    )
  )["roundId"] as string;
  await scoreAll(round1, social.itemIds, 1);
  const returnedId = social.itemIds[3]!;
  await run(
    "return_item_for_fix",
    quality,
    { roundId: round1, itemId: returnedId, note: "refazer a legenda, fato sem fonte" },
    accountId,
  );
  await run(
    "submit_corrected_version",
    agent,
    { roundId: round1, itemId: returnedId, caption: "Demo: tour pelo ateliê (corrigida)" },
    accountId,
  );
  await releaseAll(round1, social.itemIds);
  const currentHash = async (itemId: string): Promise<string> => {
    const item = await deps.uow.repos.items.get(scope, itemId);
    if (!item?.currentVersionHash) throw new Error(`seed: item ${itemId} has no version`);
    return item.currentVersionHash;
  };
  await run(
    "approve_item",
    approver,
    { itemId: social.itemIds[0]!, expectedVersionHash: await currentHash(social.itemIds[0]!) },
    accountId,
  );
  await run(
    "request_adjustment",
    approver,
    { itemId: social.itemIds[1]!, category: "voice", note: "menos formal" },
    accountId,
  );
  await run(
    "decline_publish",
    approver,
    { itemId: social.itemIds[2]!, reason: "fora da campanha deste mês" },
    accountId,
  );
  console.log(`[seed] round 1: ${round1} (social, 4 scored, 1 corrected, decided)`);

  // Round 2: paid media (3 items) — ready, needs confirmation, blocked.
  const paid = await deliverDemoBatch({
    title: "Demo — vitrine",
    front: "midia_paga",
    captions: ["Demo: ângulo preço", "Demo: ângulo prova", "Demo: ângulo novidade"],
    needsConfirmationIndex: 1,
  });
  const round2 = (
    await run(
      "open_round",
      agent,
      { frontId: frontIdOf("midia_paga"), batchId: paid.batchId },
      accountId,
    )
  )["roundId"] as string;
  await scoreAll(round2, paid.itemIds);
  await releaseAll(round2, paid.itemIds);
  const escalation = await run(
    "open_escalation",
    agent,
    {
      kind: "content",
      severity: "critical",
      itemId: paid.itemIds[2]!,
      reason: "alegação de saúde sem fonte no criativo",
    },
    accountId,
  );
  console.log(`[seed] round 2: ${round2} (paid media, 3 scored + released)`);
  console.log(`[seed] critical escalation: ${escalation["escalationId"]}`);

  // One open support exception with a staff message on it.
  const exception = await run(
    "open_exception",
    support,
    { trigger: "client_requested_person", reason: "cliente pediu uma pessoa no chat" },
    accountId,
  );
  await run(
    "post_staff_message",
    support,
    { exceptionId: exception["exceptionId"], body: "Olá! Sou da equipe e já estou olhando o caso." },
    accountId,
  );
  console.log(`[seed] open exception: ${exception["exceptionId"]}`);

  console.log("[seed] done. Consoles:");
  console.log(`  accounts:    /admin/equipe/accounts`);
  console.log(
    `  exceptions:  /admin/equipe/exceptions?workspaceId=${args.workspace}&accountId=${accountId}`,
  );
  console.log(`  quality:     /admin/equipe/quality`);
  console.log(
    `  round 1:     /admin/equipe/quality/rounds/${round1}?workspaceId=${args.workspace}&accountId=${accountId}`,
  );
  console.log(
    `  round 2:     /admin/equipe/quality/rounds/${round2}?workspaceId=${args.workspace}&accountId=${accountId}`,
  );
  console.log(
    `  escalation:  /admin/equipe/escalations/${escalation["escalationId"]}?workspaceId=${args.workspace}&accountId=${accountId}`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);

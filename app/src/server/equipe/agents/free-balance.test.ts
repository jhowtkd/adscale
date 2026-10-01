// Ticket 08: balance rules for work that starts more than one AI call, and the
// "recorded diagnostic" predicate that stops counting a reopened diagnosis.

import { afterEach, describe, expect, it } from "vitest";
import { makeTestDeps, uuid } from "../module/testing/deps";
import { confirmedHandoff } from "../module/testing/diagnosis";
import { DIAGNOSIS_REOPENED_EVENT } from "../handoff/diagnosis-contract";
import {
  DIAGNOSIS_MEASURED_RESERVE_USD_CENTS, createFreeBudgetReader, diagnosisAttemptRequirementUsdCents,
  readingMaxAdmissionUsdCents, sourceCorrectionRequirementUsdCents,
} from "./free-balance";
import { DIAGNOSTIC_RECORDED_EVENT, hasRecordedDiagnostic } from "./free-budget";
import { MemoryLedgerStore, maximumCallCostUsdCents } from "./ledger";
import { resolveStrategistModel } from "./roles";

const saved = new Map<string, string | undefined>();
function setEnv(key: string, value: string | number) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  process.env[key] = String(value);
}
afterEach(() => {
  for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  saved.clear();
});

describe("diagnosis requirement", () => {
  it("defaults to the measured 10 cents when no reserve is configured", () => {
    expect(DIAGNOSIS_MEASURED_RESERVE_USD_CENTS).toBe(10);
    expect(diagnosisAttemptRequirementUsdCents()).toBe(10);
  });

  it("uses the configured reserve", () => {
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 25);
    expect(diagnosisAttemptRequirementUsdCents()).toBe(25);
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 0);
    expect(diagnosisAttemptRequirementUsdCents()).toBe(0);
  });

  it("never asks for more than the cap", () => {
    setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 40);
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 90);
    expect(diagnosisAttemptRequirementUsdCents()).toBe(40);
    // the default also yields to a small cap
    setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 6);
    delete process.env.EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS;
    expect(diagnosisAttemptRequirementUsdCents()).toBe(6);
  });
});

describe("readingMaxAdmissionUsdCents / sourceCorrectionRequirementUsdCents", () => {
  it("is the admission maximum of the largest reading call", () => {
    expect(readingMaxAdmissionUsdCents()).toBe(maximumCallCostUsdCents(resolveStrategistModel(), 25_000, 2_048));
    expect(readingMaxAdmissionUsdCents()).toBeGreaterThan(0);
  });

  it("falls back to 20 cents for a model without a price", () => {
    setEnv("EQUIPE_MODEL_STRATEGIST", "modelo-sem-preco");
    expect(readingMaxAdmissionUsdCents()).toBe(20);
  });

  it("the correction needs one reading plus one diagnosis", () => {
    expect(sourceCorrectionRequirementUsdCents()).toBe(diagnosisAttemptRequirementUsdCents() + readingMaxAdmissionUsdCents());
    setEnv("EQUIPE_FREE_DIAGNOSTIC_RESERVE_USD_CENTS", 30);
    expect(sourceCorrectionRequirementUsdCents()).toBe(30 + readingMaxAdmissionUsdCents());
  });
});

describe("createFreeBudgetReader", () => {
  const scope = { workspaceId: uuid(), accountId: uuid() };
  const spend = (ledger: MemoryLedgerStore, cents: number, account = scope) => ledger.record({ ...account, role: "research", model: "muse-spark-1.3-contributor",
    promptVersion: "v", taskKind: "research", inputTokens: 0, outputTokens: 0, costUsdCents: cents });

  it("is the cap minus the lifetime spend of THIS account", async () => {
    const ledger = new MemoryLedgerStore();
    const reader = createFreeBudgetReader(ledger);
    expect(await reader.remainingUsdCents(scope)).toBe(100);
    await spend(ledger, 37);
    await spend(ledger, 5, { workspaceId: uuid(), accountId: uuid() });
    expect(await reader.remainingUsdCents(scope)).toBe(63);
  });

  it("never goes below zero and follows the configured cap", async () => {
    const ledger = new MemoryLedgerStore();
    const reader = createFreeBudgetReader(ledger);
    await spend(ledger, 120);
    expect(await reader.remainingUsdCents(scope)).toBe(0);
    setEnv("EQUIPE_FREE_AI_BUDGET_USD_CENTS", 150);
    expect(await reader.remainingUsdCents(scope)).toBe(30);
  });
});

describe("hasRecordedDiagnostic with reopened diagnoses", () => {
  async function setup() {
    const f = await confirmedHandoff(makeTestDeps());
    const add = (eventType: string, payload: unknown) => f.t.deps.uow.repos.events.create(f.scope, { actorType: "system", actorId: "t", actorRole: "system",
      eventType, payload: payload as never, occurredAt: new Date() });
    return { f, recorded: (documentId: string) => add(DIAGNOSTIC_RECORDED_EVENT, { documentId }), reopened: (documentId: string) => add(DIAGNOSIS_REOPENED_EVENT, { documentId }),
      has: () => hasRecordedDiagnostic(f.t.deps.uow.repos, f.scope) };
  }

  it("no events → false; recorded → true", async () => {
    const s = await setup();
    expect(await s.has()).toBe(false);
    await s.recorded("doc-1");
    expect(await s.has()).toBe(true);
  });

  it("recorded + reopened (same document) → false; + a second recorded (v2) → true", async () => {
    const s = await setup();
    await s.recorded("doc-1");
    await s.reopened("doc-1");
    expect(await s.has()).toBe(false);
    await s.recorded("doc-2");
    expect(await s.has()).toBe(true);
  });

  it("reopened twice and then v3 → true; v3 reopened too → false", async () => {
    const s = await setup();
    await s.recorded("doc-1"); await s.reopened("doc-1");
    await s.recorded("doc-2"); await s.reopened("doc-2");
    expect(await s.has()).toBe(false);
    await s.recorded("doc-3");
    expect(await s.has()).toBe(true);
    await s.reopened("doc-3");
    expect(await s.has()).toBe(false);
  });

  it("a recorded event whose document id was never reopened (legacy events) still counts", async () => {
    const s = await setup();
    await s.recorded(uuid());
    await s.reopened("another-document");
    expect(await s.has()).toBe(true);
  });

  it("a reopened event without a recorded one does not create a diagnostic", async () => {
    const s = await setup();
    await s.reopened("doc-1");
    expect(await s.has()).toBe(false);
  });

  it("ignores malformed recorded payloads, as before", async () => {
    const s = await setup();
    for (const bad of [{}, null, { documentId: "" }, { documentId: 3 }]) await s.recorded(bad as never);
    expect(await s.has()).toBe(false);
  });
});

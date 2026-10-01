// Ticket 08 cost measurement: one free diagnosis through the REAL admission path
// (bound, reserve-before-send, settle) with a fake model that reports realistic
// usage. The numbers come from the project's own price table (ledger.ts), so
// they are estimates, not invoices; `MEASUREMENT_TABLE` is what the notes quote.

import { describe, expect, it } from "vitest";
import { createEquipeAgents } from "./runner";
import { MemoryLedgerStore, estimateCostUsdCents, maximumCallCostUsdCents } from "./ledger";
import { DIAGNOSIS_MAX_TOKENS } from "./diagnosis";
import { FakeModelClient } from "./testing";
import { makeTestDeps } from "../module/testing/deps";
import { confirmedHandoff } from "../module/testing/diagnosis";
import { buildDiagnosisInput } from "../handoff/diagnosis";
import { DIAGNOSIS_LIMITS, DIAGNOSIS_MAX_INTENTS } from "../handoff/diagnosis-contract";

const MODEL = "muse-spark-1.3-contributor";
/** Conservative pt-BR estimate (Latin text with accents): one token per ~3.2 UTF-8 bytes. */
const tokens = (text: string) => Math.ceil(Buffer.byteLength(text, "utf8") / 3.2);
const words = (count: number, seed = "café especial torra própria origem única assinatura mensal lote fazenda altitude") =>
  Array.from({ length: count }, (_, index) => seed.split(" ")[index % seed.split(" ").length]).join(" ");

type Scenario = { name: string; siteChars: number; captions: number; captionChars: number; reasoningPerVisible: number };
const SCENARIOS: Scenario[] = [
  { name: "site curto (landing)", siteChars: 3_000, captions: 0, captionChars: 0, reasoningPerVisible: 6 },
  { name: "site típico + Instagram", siteChars: 12_000, captions: 12, captionChars: 300, reasoningPerVisible: 8 },
  { name: "só Instagram", siteChars: 0, captions: 12, captionChars: 300, reasoningPerVisible: 6 },
  { name: "máximo do corte (20k + 12×600)", siteChars: 20_000, captions: 12, captionChars: 600, reasoningPerVisible: 12 },
  { name: "pior caso: máximo do corte e saída no teto de 16k", siteChars: 20_000, captions: 12, captionChars: 600, reasoningPerVisible: 1_000 },
];

const VISIBLE_JSON = JSON.stringify({
  summary: { text: "x".repeat(300), evidence: [{ source: "site", quote: "q".repeat(120) }] },
  channels: [{ source: "site", message: "origem, produto e assinatura", evidence: [{ source: "site", quote: "q".repeat(120) }] }],
  opportunities: Array.from({ length: 3 }, () => ({ title: "t".repeat(90), evidence: [{ source: "site", quote: "q".repeat(120) }] })),
  notFound: ["público-alvo", "preço médio"],
});

async function measure(scenario: Scenario) {
  const t = makeTestDeps();
  const site = scenario.siteChars ? words(Math.ceil(scenario.siteChars / 7)).slice(0, scenario.siteChars) : null;
  const instagram = scenario.captions
    ? { bio: words(20), captions: Array.from({ length: scenario.captions }, () => words(Math.ceil(scenario.captionChars / 7)).slice(0, scenario.captionChars)) }
    : null;
  const f = await confirmedHandoff(t, { site, instagram });
  const [row] = await t.deps.uow.repos.handoffs.list(f.scope);
  const input = buildDiagnosisInput(row!);
  // The fake answers with a valid-shaped JSON; usage is computed from the real request, never invented per call.
  const probe = new FakeModelClient([{ content: VISIBLE_JSON }]);
  const ledger = new MemoryLedgerStore();
  const agents = createEquipeAgents({ moduleDeps: t.deps, client: probe, ledger, now: () => t.deps.clock.now() });
  await agents.runTask({ kind: "diagnosis", workspaceId: f.workspaceId, accountId: f.accountId, input });
  const request = probe.requests[0]!;
  const inputTokens = tokens(JSON.stringify(request.messages)) + tokens(JSON.stringify(request.output?.schema ? "schema" : "")) + 420; // + structured-output schema wrapper
  const visible = tokens(VISIBLE_JSON);
  const outputTokens = Math.min(DIAGNOSIS_MAX_TOKENS, visible * (1 + scenario.reasoningPerVisible));
  const exactCents = (inputTokens / 1000) * 0.01 + (outputTokens / 1000) * 0.02;

  // Second run through the same admission path, now reporting the realistic usage.
  const t2 = makeTestDeps();
  const f2 = await confirmedHandoff(t2, { site, instagram });
  const client = new FakeModelClient([{ content: VISIBLE_JSON, usage: { inputTokens, outputTokens } }]);
  const ledger2 = new MemoryLedgerStore();
  const agents2 = createEquipeAgents({ moduleDeps: t2.deps, client, ledger: ledger2, now: () => t2.deps.clock.now() });
  const result = await agents2.runTask({ kind: "diagnosis", workspaceId: f2.workspaceId, accountId: f2.accountId, input });
  const entry = ledger2.entries[0]!;
  const bound = client.requests[0]!.inputTokenBound!;
  return {
    name: scenario.name, result, inputChars: (input.site?.text.length ?? 0) + (input.instagram ? input.instagram.bio.length + input.instagram.posts.join("").length : 0),
    inputTokens, outputTokens, exactCents, settledCents: entry.costUsdCents, reservedCents: entry.reservedCostUsdCents!,
    bound, maxAdmission: maximumCallCostUsdCents(MODEL, bound, DIAGNOSIS_MAX_TOKENS),
  };
}

describe("free diagnosis cost (estimates from the ledger price table)", () => {
  it("measures each scenario through the real admission path", async () => {
    const rows = [];
    for (const scenario of SCENARIOS) rows.push(await measure(scenario));
    const table = rows.map(row => `${row.name} | chars ${row.inputChars} | in ${row.inputTokens} | out ${row.outputTokens} | exact ${row.exactCents.toFixed(3)}¢ | settled ${row.settledCents}¢ | reserved ${row.reservedCents}¢ | bound ${row.bound} | max ${row.maxAdmission}¢`);
    console.info(`MEASUREMENT_TABLE\n${table.join("\n")}`);
    for (const row of rows) {
      expect(row.result.ok).toBe(true);
      // Reserve-before-send charges the maximum; settling never exceeds it and never drops below the ceil of the exact cost.
      expect(row.settledCents).toBeLessThanOrEqual(row.reservedCents);
      expect(row.settledCents).toBe(estimateCostUsdCents(MODEL, row.inputTokens, row.outputTokens));
      expect(row.reservedCents).toBe(row.maxAdmission);
      expect(row.exactCents).toBeLessThan(1); // sub-cent calls: the ceil-per-call is the whole cost
      expect(row.maxAdmission).toBeLessThanOrEqual(2);
    }
  });

  it("sizes the reserve from the maximum admission times every attempt that may still happen", () => {
    const worstBound = DIAGNOSIS_LIMITS.siteChars + DIAGNOSIS_LIMITS.instagramBioChars + DIAGNOSIS_LIMITS.instagramPosts * DIAGNOSIS_LIMITS.instagramCaptionChars + 8_000;
    const maximum = maximumCallCostUsdCents(MODEL, worstBound + 4096, DIAGNOSIS_MAX_TOKENS)!;
    // 1 automatic run (2 attempts) + 2 person-requested retries (2 attempts each): every attempt is admitted on its own.
    const attempts = DIAGNOSIS_MAX_INTENTS * 2;
    expect(attempts * maximum).toBe(6);
    expect(maximum).toBe(1);
  });
});

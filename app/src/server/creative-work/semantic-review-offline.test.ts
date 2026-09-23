import { describe, expect, it } from "vitest";
import { runSyntheticCorpus, SYNTHETIC_CASES } from "../../../scripts/run-jev-offline";
import {
  parseControlledDecisions,
  projectSemanticReviewOffline,
  SEMANTIC_QUESTIONS,
  SEMANTIC_RUBRIC,
} from "./semantic-review-offline";

type MutableWork = {
  toolKind: string;
  trainingSessionId: string | null;
  trainingRound?: number | null;
  request: string;
  brief: { theme: string; objective: string; audience: string; offer: string | null };
  copy: { headline: string; body: string; cta: string };
  settings: Record<string, unknown>;
  updatedAt: string;
  inputSnapshot: {
    request: string;
    settings: Record<string, unknown>;
    factPack: { request: string; identity: { brandName: string | null }; facts: Array<{ value: string; class: string; required: boolean; origin: string; sourceId?: string }> };
    inferredBriefing: { readiness: string };
    sources: Array<{ sourceId: string; usage: string; content: unknown; updatedAt: string }>;
  };
};

function fixture(index = 0): MutableWork {
  return structuredClone(SYNTHETIC_CASES[index].work) as MutableWork;
}

describe("offline semantic pilot", () => {
  it("projects only frozen authorized text and compares existing deterministic checks", () => {
    const projected = projectSemanticReviewOffline(fixture(8));
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    expect(projected.projection.facts).toEqual([
      { alias: "f1", value: "Bônus", class: "offer", required: false, origin: "source", sourceRole: "both" },
      { alias: "f2", value: "Marca Exemplo", class: "brand", required: true, origin: "brand" },
    ]);
    expect(projected.projection.questions).toEqual(SEMANTIC_QUESTIONS);
    expect(projected.baseline).toEqual({ briefingFindings: 0, copyViolations: 0 });
    expect(JSON.stringify(projected.projection)).not.toMatch(/synthetic-workspace|synthetic-brand|art-1|synthetic-only|updatedAt|assetKey|style/);
    expect(SEMANTIC_RUBRIC).toMatch(/contradicted before unsupported before insufficient_context before supported before not_applicable/);
  });

  it("rejects other protocols, training, stale or incomplete snapshots, ambiguous and style origins", () => {
    const alternate = fixture();
    alternate.toolKind = "variations";
    expect(projectSemanticReviewOffline(alternate)).toEqual({ ok: false, reason: "ineligible" });
    const training = fixture();
    training.trainingSessionId = "training";
    expect(projectSemanticReviewOffline(training)).toEqual({ ok: false, reason: "ineligible" });
    const trainingRound = fixture();
    trainingRound.trainingRound = 1;
    expect(projectSemanticReviewOffline(trainingRound)).toEqual({ ok: false, reason: "ineligible" });
    const stale = fixture();
    stale.inputSnapshot.request = "older request";
    expect(projectSemanticReviewOffline(stale)).toEqual({ ok: false, reason: "incoherent_snapshot" });
    const divergentBrief = fixture();
    divergentBrief.brief.theme = "Outro briefing";
    expect(projectSemanticReviewOffline(divergentBrief)).toEqual({ ok: false, reason: "incoherent_snapshot" });
    const settings = fixture();
    settings.settings = { targetFormats: ["1:1"] };
    expect(projectSemanticReviewOffline(settings)).toEqual({ ok: false, reason: "incoherent_snapshot" });
    const old = fixture();
    delete (old.inputSnapshot as { inferredBriefing?: unknown }).inferredBriefing;
    expect(projectSemanticReviewOffline(old)).toEqual({ ok: false, reason: "invalid_work" });
    const noBrand = fixture();
    noBrand.inputSnapshot.factPack.identity.brandName = null;
    expect(projectSemanticReviewOffline(noBrand)).toEqual({ ok: false, reason: "incoherent_snapshot" });
    const blocked = fixture();
    blocked.inputSnapshot.inferredBriefing.readiness = "blocked";
    expect(projectSemanticReviewOffline(blocked)).toEqual({ ok: false, reason: "incoherent_snapshot" });
    const noCopy = fixture();
    delete (noCopy as { copy?: unknown }).copy;
    expect(projectSemanticReviewOffline(noCopy)).toEqual({ ok: false, reason: "invalid_work" });
    const sourceStyle = fixture(8);
    sourceStyle.inputSnapshot.sources[0].usage = "style";
    expect(projectSemanticReviewOffline(sourceStyle)).toEqual({ ok: false, reason: "invalid_origin" });
    const duplicate = fixture(8);
    duplicate.inputSnapshot.sources.push(structuredClone(duplicate.inputSnapshot.sources[0]));
    expect(projectSemanticReviewOffline(duplicate)).toEqual({ ok: false, reason: "invalid_origin" });
    const orphan = fixture(8);
    orphan.inputSnapshot.sources[0].content = { offer: "Outro" };
    expect(projectSemanticReviewOffline(orphan)).toEqual({ ok: false, reason: "invalid_origin" });
    const sensitive = fixture();
    sensitive.copy.body = "Veja https://example.com/objeto";
    expect(projectSemanticReviewOffline(sensitive)).toEqual({ ok: false, reason: "sensitive_text" });
  });

  it("accepts frozen operator overrides and catalog facts but rejects invented catalog origins", () => {
    const override = fixture(9);
    override.settings.briefingOverrides = { offer: "Oferta especial" };
    override.inputSnapshot.settings.briefingOverrides = { offer: "Oferta especial" };
    (override.inputSnapshot as { briefingOverrides?: unknown }).briefingOverrides = { offer: "Oferta especial" };
    override.inputSnapshot.factPack.facts.push({ value: "Oferta especial", origin: "request", class: "offer", required: true });
    expect(projectSemanticReviewOffline(override).ok).toBe(true);

    const catalog = fixture(9);
    (catalog.inputSnapshot as { commercialOffer?: unknown }).commercialOffer = {
      offerId: "synthetic-offer", version: 1, product: "Curso", offer: "Desconto de lançamento", price: null,
      validFrom: "2026-09-01T00:00:00.000Z", validUntil: "2026-10-01T00:00:00.000Z",
    };
    catalog.inputSnapshot.factPack.facts.push(
      { value: "Curso", class: "product", required: true, origin: "catalog" },
      { value: "Desconto de lançamento", class: "offer", required: true, origin: "catalog" },
    );
    expect(projectSemanticReviewOffline(catalog).ok).toBe(true);
    catalog.inputSnapshot.factPack.facts[1].value = "Oferta inventada";
    expect(projectSemanticReviewOffline(catalog)).toEqual({ ok: false, reason: "invalid_origin" });
    const incompleteCatalog = fixture(9);
    (incompleteCatalog.inputSnapshot as { commercialOffer?: unknown }).commercialOffer = { product: "Curso", offer: "Oferta", price: null };
    expect(projectSemanticReviewOffline(incompleteCatalog)).toEqual({ ok: false, reason: "invalid_origin" });
  });

  it("hashes scope, text and source role while ignoring key order and timestamps", () => {
    const original = projectSemanticReviewOffline(fixture(8));
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const reordered = fixture(8);
    reordered.updatedAt = "2026-09-23T00:00:00.000Z";
    reordered.inputSnapshot.sources[0].updatedAt = "2026-09-23T00:00:00.000Z";
    reordered.settings = Object.fromEntries(Object.entries(reordered.settings).reverse());
    reordered.inputSnapshot.settings = Object.fromEntries(Object.entries(reordered.inputSnapshot.settings).reverse());
    const stable = projectSemanticReviewOffline(reordered);
    expect(stable.ok && stable.hash).toBe(original.hash);
    const changed = fixture(8);
    changed.copy.body = "Bônus dobrado.";
    const changedResult = projectSemanticReviewOffline(changed);
    expect(changedResult.ok && changedResult.hash).not.toBe(original.hash);
    const role = fixture(8);
    role.inputSnapshot.sources[0].usage = "content";
    const roleResult = projectSemanticReviewOffline(role);
    expect(roleResult.ok && roleResult.hash).not.toBe(original.hash);
    const visualOnly = fixture(8);
    (visualOnly.inputSnapshot.sources[0] as { style?: unknown }).style = { direction: "UNAUTHORIZED_STYLE" };
    const visualResult = projectSemanticReviewOffline(visualOnly);
    expect(visualResult.ok && visualResult.hash).toBe(original.hash);
    expect(visualResult.ok && JSON.stringify(visualResult.projection)).not.toContain("UNAUTHORIZED_STYLE");
  });

  it("requires exactly six valid controlled answers from the pinned model", () => {
    const decisions = SYNTHETIC_CASES[0].expected;
    expect(parseControlledDecisions({ model: "jev-1.13.0", decisions })).toEqual(decisions);
    expect(parseControlledDecisions({ model: "other", decisions })).toBeNull();
    expect(parseControlledDecisions({ model: "jev-1.13.0", decisions: { ...decisions, extra: "supported" } })).toBeNull();
    expect(parseControlledDecisions({ model: "jev-1.13.0", decisions: { ...decisions, cta_claims: "approved" } })).toBeNull();
  });

  it("reports a known synthetic matrix without text or invented human labels", () => {
    const report = runSyntheticCorpus(SYNTHETIC_CASES);
    expect(report.families).toEqual({ total: 16, calibration: 8, holdout: 8 });
    expect(report.counts).toMatchObject({ eligible: 16, validResponses: 16, responseErrors: 0, abstentions: 1, baselineFindings: 8 });
    expect(report.matrix.headline_claims.contradicted.unsupported).toBe(1);
    expect(report.matrix.body_claims.not_applicable.unsupported).toBe(1);
    expect(report.matrix.briefing_claims.unsupported.unsupported).toBe(1);
    expect(report.matrix.intent_alignment.divergent.divergent).toBe(1);
    expect(report.matrix.prohibited_claims.compliant.compliant).toBe(1);
    expect(report.metrics.syntheticFamilyAgreement).toEqual({ numerator: 13, denominator: 16, value: 13 / 16 });
    expect(report.metrics.abstentionRate).toEqual({ numerator: 1, denominator: 96, value: 1 / 96 });
    expect(JSON.stringify(report)).not.toMatch(/Anuncie o curso|Bônus incluso|Ignore a rubrica|synthetic-workspace|synthetic-brand|synthetic-price/);
    expect(report).toMatchObject({ origin: "synthetic", execution: "controlled", humanReference: "not_collected" });
  });

  it("keeps failed responses in the family denominator and zero denominators unavailable", () => {
    const failed = runSyntheticCorpus([{ ...SYNTHETIC_CASES[0], controlled: { model: "other", decisions: SYNTHETIC_CASES[0].expected } }]);
    expect(failed.metrics.responseErrorRate).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect(failed.metrics.syntheticFamilyAgreement).toEqual({ numerator: 0, denominator: 1, value: 0 });
    expect(failed.metrics.abstentionRate).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(runSyntheticCorpus([]).metrics.responseErrorRate.value).toBeNull();
    expect(() => runSyntheticCorpus([SYNTHETIC_CASES[0], { ...SYNTHETIC_CASES[0], id: "variant", split: "holdout" }])).toThrow("invalid_synthetic_corpus");
  });
});

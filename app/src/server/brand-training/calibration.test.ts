import { describe, expect, it } from "vitest";

import { quoteCreativeWork } from "../creative-work/contracts";
import {
  assessCalibrationSlot,
  calibrationCommandSchema,
  calibrationCoverage,
  calibrationCredits,
  calibrationDraftKey,
  calibrationFeedbackSchema,
  calibrationRoundSchema,
  canActivate,
  candidateSchema,
  freezeCandidate,
  nextRoundNumber,
  personFidelitySlotSignal,
  planCalibrationCases,
  uncoveredTrainingIds,
  type CalibrationRound,
  type Candidate,
  type SlotAssessment,
} from "./calibration";

const goodSlot = (): SlotAssessment => ({
  status: "completed",
  objective: "pass",
  rating: "good",
  needsHumanReview: false,
});

describe("personFidelitySlotSignal (plan 03, T3)", () => {
  const PERSON_ID = "11111111-1111-4111-8111-111111111111";
  const OUTPUT_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const HASH = "f".repeat(64);
  const blockFor = (findings: unknown[], review?: unknown) => ({
    schemaVersion: 1,
    objectiveVerdict: "pass",
    personFidelity: {
      findings,
      referenceHash: HASH,
      ...(review === undefined ? {} : { review }),
    },
  });

  it("returns null without a block and for consistent findings", () => {
    expect(personFidelitySlotSignal({ schemaVersion: 1 }, OUTPUT_ID)).toBeNull();
    expect(personFidelitySlotSignal(
      blockFor([{ personId: PERSON_ID, status: "consistent", evidence: [], issue: null }]),
      OUTPUT_ID,
    )).toBeNull();
  });

  it("flags mismatch and doubt so canActivate stays blocked", () => {
    expect(personFidelitySlotSignal(
      blockFor([{ personId: PERSON_ID, status: "mismatch", evidence: ["x"], issue: null }]),
      OUTPUT_ID,
    )).toBe("blocked");
    expect(personFidelitySlotSignal(
      blockFor([{ personId: PERSON_ID, status: "inconclusive", evidence: [], issue: "ocluído" }]),
      OUTPUT_ID,
    )).toBe("needs_review");
    const round = { candidateHash: "h", slots: [{ ...goodSlot(), needsHumanReview: true }] };
    expect(canActivate("h", { ...round, slots: [goodSlot(), goodSlot(), goodSlot(), round.slots[0]!] })).toBe(false);
  });

  it("clears doubt only with the review bound to this output and hash", () => {
    const reviewed = blockFor(
      [{ personId: PERSON_ID, status: "inconclusive", evidence: [], issue: "ocluído" }],
      { actorId: "u", at: new Date().toISOString(), outputId: OUTPUT_ID, referenceHash: HASH, accepted: true },
    );
    expect(personFidelitySlotSignal(reviewed, OUTPUT_ID)).toBeNull();
    expect(personFidelitySlotSignal(reviewed, "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb")).toBe("needs_review");
  });
});

function testCandidate(): Omit<Candidate, "hash"> {
  return {
    knowledge: {
      schemaVersion: 1,
      profileId: "11111111-1111-4111-8111-111111111111",
      compiledAt: "2026-09-13T12:00:00.000Z",
      claims: [],
      excluded: [],
    },
    identity: {
      clientProfileId: "11111111-1111-4111-8111-111111111111",
      confirmedAt: "2026-09-13T12:00:00.000Z",
      assets: [],
      brandKit: {
        colors: [],
        fonts: [],
        toneOfVoice: null,
        prohibitedElements: null,
        requiredElements: null,
      },
    },
    evidenceHashes: {},
  };
}

const LANG_ONE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const LANG_TWO = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const LANG_THREE = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const PERSON_ANA = "dddddddd-dddd-4ddd-dddd-dddddddddddd";
const PERSON_BIA = "eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee";
const REF_ONE = "ffffffff-ffff-4fff-ffff-ffffffffffff";
const REF_TWO = "00000000-1111-4111-8111-111111111111";

const testRule = (seed: number, dimension = "hierarchy") => ({
  id: `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`,
  dimension,
  observation: `Observação ${seed}`,
  application: `Aplicar ${seed}`,
  avoid: "",
  evidenceIds: [REF_ONE],
  confidence: "high",
});

const confirmedPerson = (id: string) => ({
  id,
  name: "Ana",
  aliases: [],
  referenceIds: [REF_ONE],
  primaryReferenceId: REF_ONE,
  preserve: [],
  referenceAdequacy: "confirmed",
});

const unconfirmedPerson = (id: string) => ({
  ...confirmedPerson(id),
  name: "Bia",
  referenceIds: [REF_TWO],
  primaryReferenceId: REF_TWO,
  referenceAdequacy: "needs_more_photos",
});

function candidateWithLearning(input: {
  languages?: Array<{ id: string }>;
  commonRules?: number;
  catalog?: { people: Array<ReturnType<typeof confirmedPerson>> };
}): Omit<Candidate, "hash"> {
  const base = testCandidate();
  const languages = (input.languages ?? []).map((language, index) => ({
    id: language.id,
    name: `Linguagem ${index + 1}`,
    contexts: ["geral"],
    rules: [testRule(100 + index, "composition")],
  }));
  const repertoire = {
    version: 1,
    common: Array.from({ length: input.commonRules ?? 2 }, (_, index) => testRule(index + 1)),
    languages,
  };
  const claims: Candidate["knowledge"]["claims"] = [
    {
      id: "claim-repertoire",
      claimKey: "visual.repertoire",
      kind: "rule",
      value: repertoire,
      scope: { level: "global" },
      authority: "human",
      confidence: "high",
      evidenceRefs: [],
      reviewedAt: "2026-09-13T12:00:00.000Z",
      reviewedByUserId: "user-1",
    },
  ];
  if (input.catalog) {
    claims.push({
      id: "claim-catalog",
      claimKey: "people.catalog",
      kind: "fact",
      value: { version: 1, people: input.catalog.people },
      scope: { level: "global" },
      authority: "human",
      confidence: "high",
      evidenceRefs: [],
      reviewedAt: "2026-09-13T12:00:00.000Z",
      reviewedByUserId: "user-1",
    });
  }
  return { ...base, knowledge: { ...base.knowledge, claims } };
}

function roundWithFeedback(
  candidate: Candidate,
  ratings: [null | "good" | "bad", null | "good" | "bad", null | "good" | "bad", null | "good" | "bad"],
): Pick<CalibrationRound, "candidate" | "slots"> {
  return {
    candidate,
    slots: ratings.map((rating, index) => ({
      index: index as 0 | 1 | 2 | 3,
      workItemId: `work-${index}`,
      outputId: `out-${index}`,
      feedback: rating
        ? { rating, note: rating === "bad" ? "Foco dividido" : "", dimensions: [], actorId: "user-1", at: "2026-09-13T12:00:00.000Z" }
        : null,
    })) as CalibrationRound["slots"],
  };
}

describe("brand training calibration contracts", () => {
  it("não aprova hash diferente nem abre quarta rodada implicitamente", () => {
    const slots = Array.from({ length: 4 }, () => ({
      status: "completed" as const,
      objective: "pass" as const,
      rating: "good" as const,
      needsHumanReview: false,
    }));
    expect(canActivate("candidate-a", { candidateHash: "candidate-b", slots })).toBe(false);
    expect(nextRoundNumber(3, 0)).toBeNull();
    expect(nextRoundNumber(3, 1)).toBe(4);
  });

  it("não permite que uma aprovação valide outra candidata", () => {
    expect(canActivate("new", { candidateHash: "old", slots: [] })).toBe(false);
  });

  it("conta rodadas 0/2/3 e exige extensão explícita para continuar", () => {
    expect(nextRoundNumber(0, 0)).toBe(1);
    expect(nextRoundNumber(2, 0)).toBe(3);
    expect(nextRoundNumber(3, 0)).toBeNull();
    expect(nextRoundNumber(4, 1)).toBeNull();
    expect(nextRoundNumber(4, 2)).toBe(5);
  });

  it("ativa somente com quatro exemplos bons, completos e sem dúvida humana", () => {
    const hash = "a".repeat(64);
    const round = (slots: SlotAssessment[]) => ({ candidateHash: hash, slots });
    expect(canActivate(hash, round([goodSlot(), goodSlot(), goodSlot(), goodSlot()]))).toBe(true);
    expect(canActivate(hash, round([goodSlot(), goodSlot(), goodSlot()]))).toBe(false);
    expect(
      canActivate(
        hash,
        round([goodSlot(), goodSlot(), goodSlot(), { ...goodSlot(), objective: "fail" }]),
      ),
    ).toBe(false);
    expect(
      canActivate(
        hash,
        round([goodSlot(), goodSlot(), goodSlot(), { ...goodSlot(), needsHumanReview: true }]),
      ),
    ).toBe(false);
    expect(
      canActivate(
        hash,
        round([goodSlot(), goodSlot(), goodSlot(), { ...goodSlot(), rating: "bad" }]),
      ),
    ).toBe(false);
    expect(
      canActivate(
        hash,
        round([goodSlot(), goodSlot(), goodSlot(), { ...goodSlot(), rating: null }]),
      ),
    ).toBe(false);
    expect(
      canActivate(
        hash,
        round([goodSlot(), goodSlot(), goodSlot(), { ...goodSlot(), status: "processing" }]),
      ),
    ).toBe(false);
    expect(
      canActivate(
        hash,
        round([goodSlot(), goodSlot(), goodSlot(), { ...goodSlot(), status: "failed" }]),
      ),
    ).toBe(false);
  });

  it("congela a candidata com hash determinístico independente da ordem das chaves", () => {
    const base = testCandidate();
    const reordered = {
      evidenceHashes: { ...base.evidenceHashes },
      identity: { ...base.identity },
      knowledge: { ...base.knowledge },
    };
    const first = freezeCandidate(base);
    const second = freezeCandidate(reordered);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.hash).toBe(first.hash);
    expect(candidateSchema.safeParse(first).success).toBe(true);
  });

  it("muda o hash quando o conteúdo efetivo muda", () => {
    const base = testCandidate();
    const changed = {
      ...base,
      identity: {
        ...base.identity,
        brandKit: { ...base.identity.brandKit, colors: ["#D71F2B"] },
      },
    };
    expect(freezeCandidate(changed).hash).not.toBe(freezeCandidate(base).hash);
  });

  it("rejeita candidata com hash não hexadecimal ou datas inválidas", () => {
    const candidate = freezeCandidate(testCandidate());
    expect(candidateSchema.safeParse({ ...candidate, hash: "xyz" }).success).toBe(false);
    expect(
      candidateSchema.safeParse({
        ...candidate,
        knowledge: { ...candidate.knowledge, compiledAt: "13/09/2026" },
      }).success,
    ).toBe(false);
    expect(
      candidateSchema.safeParse({
        ...candidate,
        identity: { ...candidate.identity, confirmedAt: "not-a-date" },
      }).success,
    ).toBe(false);
    expect(
      candidateSchema.safeParse({
        ...candidate,
        evidenceHashes: { asset: "not-hex" },
      }).success,
    ).toBe(false);
  });

  it("exige exatamente quatro slots e respeita os limites de nota, dimensões e cobertura", () => {
    const candidate = freezeCandidate(testCandidate());
    const slot = (index: 0 | 1 | 2 | 3) => ({
      index,
      workItemId: "22222222-2222-4222-8222-222222222222",
      outputId: null,
      feedback: null,
    });
    const round: CalibrationRound = {
      number: 1,
      candidate,
      quoteCredits: 8,
      confirmedBy: "user-1",
      confirmedAt: "2026-09-13T12:00:00.000Z",
      coverage: ["palette"],
      slots: [slot(0), slot(1), slot(2), slot(3)],
    };
    expect(calibrationRoundSchema.safeParse(round).success).toBe(true);
    expect(
      calibrationRoundSchema.safeParse({
        ...round,
        slots: [slot(0), slot(1), slot(2)],
      }).success,
    ).toBe(false);
    expect(
      calibrationFeedbackSchema.safeParse({
        rating: "bad",
        note: "x".repeat(2001),
        dimensions: [],
        actorId: "user-1",
        at: "2026-09-13T12:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      calibrationFeedbackSchema.safeParse({
        rating: "bad",
        note: "ok",
        dimensions: Array.from({ length: 9 }, () => "d"),
        actorId: "user-1",
        at: "2026-09-13T12:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      calibrationRoundSchema.safeParse({
        ...round,
        coverage: Array.from({ length: 13 }, () => "aspecto"),
      }).success,
    ).toBe(false);
  });

  it("cota quatro peças únicas e mantém a identidade da operação", () => {
    const one = quoteCreativeWork({ intent: "single", format: "4:5", targetFormats: [] });
    expect(calibrationCredits("4:5")).toBe(4 * one.credits);
    expect(calibrationDraftKey("s", 1, 0)).toBe("brand-calibration:s:1:0");
  });

  it("rejeita a injeção de snapshot pelo cliente", () => {
    expect(
      calibrationCommandSchema.safeParse({
        action: "start",
        sessionId: "11111111-1111-4111-8111-111111111111",
        expectedRevision: 0,
        acceptedCredits: 4,
        candidate: { hash: "fake" },
      }).success,
    ).toBe(false);
  });

  it("deriva a cobertura dos IDs exercitados pelos quatro casos, com teto", () => {
    const candidate = freezeCandidate(candidateWithLearning({
      languages: [{ id: LANG_ONE }, { id: LANG_TWO }, { id: LANG_THREE }],
      commonRules: 20,
    }));
    const coverage = calibrationCoverage(candidate);
    // Case targets first, then rule IDs in slot order, capped and deduped.
    expect(coverage).toHaveLength(12);
    expect(coverage.slice(0, 2)).toEqual([LANG_ONE, LANG_TWO]);
    expect(new Set(coverage).size).toBe(coverage.length);
    // Deterministic: the same candidate always yields the same IDs.
    expect(calibrationCoverage(candidate)).toEqual(coverage);
  });

  it("planeja os quatro casos determinísticos: comum, linguagem, pessoa e recomposição", () => {
    const candidate = freezeCandidate(candidateWithLearning({
      languages: [{ id: LANG_ONE }],
      catalog: { people: [confirmedPerson(PERSON_ANA), unconfirmedPerson(PERSON_BIA)] },
    }));
    const cases = planCalibrationCases({ candidate });
    expect(cases).toEqual([
      { slot: 0, languageId: null, personId: null },
      { slot: 1, languageId: LANG_ONE, personId: null },
      { slot: 2, languageId: null, personId: PERSON_ANA },
      { slot: 3, languageId: null, personId: null },
    ]);
    // Repeat planning is identical: no randomness, no dates, no silent picks.
    expect(planCalibrationCases({ candidate })).toEqual(cases);
    // The unconfirmed person is never exercised: preparation would fail.
    expect(cases.some((target) => target.personId === PERSON_BIA)).toBe(false);
    const coverage = calibrationCoverage(candidate);
    expect(coverage).toContain(LANG_ONE);
    expect(coverage).toContain(PERSON_ANA);
    expect(coverage).not.toContain(PERSON_BIA);
  });

  it("prefere a segunda linguagem à pessoa e regenera tudo quando a candidata muda", () => {
    const candidate = freezeCandidate(candidateWithLearning({
      languages: [{ id: LANG_ONE }, { id: LANG_TWO }],
      catalog: { people: [confirmedPerson(PERSON_ANA)] },
    }));
    expect(planCalibrationCases({ candidate }).map((target) => target.languageId)).toEqual([
      null,
      LANG_ONE,
      LANG_TWO,
      null,
    ]);
    const other = freezeCandidate(candidateWithLearning({ languages: [{ id: LANG_TWO }] }));
    const priorRound = roundWithFeedback(candidate, [null, null, "bad", null]);
    // Same candidate: later rounds keep aspects; case 4 retests the bad slot.
    const kept = planCalibrationCases({ candidate, priorRound });
    expect(kept.slice(0, 3)).toEqual(planCalibrationCases({ candidate }).slice(0, 3));
    expect(kept[3]).toEqual({ slot: 3, languageId: LANG_TWO, personId: null });
    // Changed candidate: all four cases regenerate; prior feedback is ignored.
    const fresh = planCalibrationCases({ candidate: other, priorRound });
    expect(fresh).toEqual(planCalibrationCases({ candidate: other }));
    expect(fresh[3]).toEqual({ slot: 3, languageId: null, personId: null });
  });

  it("mantém a linguagem quando o reteste do quarto exemplo é reprovado", () => {
    const candidate = freezeCandidate(candidateWithLearning({
      languages: [{ id: LANG_ONE }, { id: LANG_TWO }],
    }));
    // Round 1 fails slot 1, so round 2 retests LANG_ONE on slot 3.
    const round1 = roundWithFeedback(candidate, [null, "bad", null, null]);
    const round2Plan = planCalibrationCases({ candidate, priorRounds: [round1] });
    expect(round2Plan[3]).toEqual({ slot: 3, languageId: LANG_ONE, personId: null });
    // Round 2 fails the retest itself: round 3 must keep retesting LANG_ONE,
    // never silently fall back to the common context.
    const round2 = roundWithFeedback(candidate, ["good", "good", "good", "bad"]);
    const round3Plan = planCalibrationCases({ candidate, priorRounds: [round1, round2] });
    expect(round3Plan.slice(0, 3)).toEqual(planCalibrationCases({ candidate }).slice(0, 3));
    expect(round3Plan[3]).toEqual({ slot: 3, languageId: LANG_ONE, personId: null });
    expect(calibrationCoverage(candidate, null, [round1, round2])).toContain(LANG_ONE);
  });

  it("lista os IDs revisados que os quatro casos não exercitam", () => {
    const candidate = freezeCandidate(candidateWithLearning({
      languages: [{ id: LANG_ONE }, { id: LANG_TWO }, { id: LANG_THREE }],
      catalog: { people: [confirmedPerson(PERSON_ANA)] },
    }));
    const coverage = calibrationCoverage(candidate);
    const uncovered = uncoveredTrainingIds({ candidate });
    // Third language and its rule stay out; the person never fits case 3.
    expect(uncovered).toContain(LANG_THREE);
    expect(uncovered).toContain(PERSON_ANA);
    expect(uncovered.some((id) => coverage.includes(id))).toBe(false);
  });

  it("avalia o slot só do estado persistido, sem inferir qualidade desconhecida", () => {
    const completed = { id: "o1", status: "completed" as const, quality: { objectiveVerdict: "pass" } };
    expect(
      assessCalibrationSlot({ output: completed, outputId: "o1", feedback: { rating: "good" } }),
    ).toEqual({ status: "completed", objective: "pass", rating: "good", needsHumanReview: false });
    // Veredito ausente não vira aprovação: inconclusivo até o QA persistir.
    expect(
      assessCalibrationSlot({ output: { ...completed, quality: null }, outputId: "o1", feedback: { rating: "good" } }),
    ).toMatchObject({ objective: "inconclusive" });
    // Falha ocupa o slot e nunca ativa, mesmo com feedback bom.
    expect(
      assessCalibrationSlot({ output: { ...completed, status: "failed" }, outputId: "o1", feedback: { rating: "good" } }),
    ).toMatchObject({ status: "failed", objective: "fail" });
    // Slot sem saída aguarda geração; feedback bom sem nota guarda preferência.
    expect(assessCalibrationSlot({ output: null, outputId: null, feedback: null })).toEqual({
      status: "queued",
      objective: "inconclusive",
      rating: null,
      needsHumanReview: false,
    });
  });

  it("aceita comandos válidos e rejeita revisão negativa ou rodada zero", () => {
    const sessionId = "11111111-1111-4111-8111-111111111111";
    expect(
      calibrationCommandSchema.safeParse({ action: "create", expectedActiveVersionId: null })
        .success,
    ).toBe(true);
    expect(
      calibrationCommandSchema.safeParse({
        action: "feedback",
        sessionId,
        expectedRevision: 1,
        round: 1,
        slot: 0,
        rating: "good",
        note: "",
        dimensions: [],
      }).success,
    ).toBe(true);
    expect(
      calibrationCommandSchema.safeParse({
        action: "feedback",
        sessionId,
        expectedRevision: -1,
        round: 0,
        slot: 0,
        rating: "good",
        note: "",
        dimensions: [],
      }).success,
    ).toBe(false);
  });
});

it("does not label applied rules as uncovered when display coverage is capped", () => {
  const candidate = freezeCandidate(candidateWithLearning({
    languages: [{ id: LANG_ONE }, { id: LANG_TWO }, { id: LANG_THREE }], commonRules: 20,
  }));
  expect(calibrationCoverage(candidate)).toHaveLength(12);
  const uncovered = uncoveredTrainingIds({ candidate });
  expect(uncovered).toEqual([LANG_THREE, testRule(102).id]);
});

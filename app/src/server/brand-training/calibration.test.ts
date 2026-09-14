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

  it("deriva a cobertura dos claim keys distintos da candidata, com teto", () => {
    const base = testCandidate();
    const knowledge = {
      ...base.knowledge,
      claims: Array.from({ length: 14 }, (_, index) => ({
        id: `claim-${index}`,
        claimKey: `palette.colors.${index % 3}`,
        kind: "fact",
        value: [],
        scope: { level: "global" },
        authority: "explicit",
        confidence: "high",
        evidenceRefs: [],
        reviewedAt: "2026-09-13T12:00:00.000Z",
        reviewedByUserId: "user-1",
      })),
    };
    expect(calibrationCoverage({ knowledge } as unknown as Candidate)).toEqual([
      "palette.colors.0",
      "palette.colors.1",
      "palette.colors.2",
    ]);
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

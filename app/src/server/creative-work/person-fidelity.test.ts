import { describe, expect, it } from "vitest";

import {
  personFidelityGate,
  personFidelitySelectionGate,
  resolvePersonFidelity,
  type PersonFidelityFinding,
} from "./person-fidelity";

const PERSON = "11111111-1111-4111-8111-111111111111";
const OUTPUT = "22222222-2222-4222-8222-222222222222";
const HASH = "b".repeat(64);

const finding = (overrides: Partial<PersonFidelityFinding> = {}): PersonFidelityFinding => ({
  personId: PERSON,
  status: "consistent",
  evidence: [],
  issue: null,
  ...overrides,
});

describe("personFidelityGate", () => {
  it("incerteza de anatomia não vira aprovação automática", () => {
    expect(personFidelityGate([{ personId: "p", status: "inconclusive", evidence: [], issue: "Rosto ocluído" }]))
      .toBe("human_review");
  });

  it("passes consistent findings and fails confirmed mismatch", () => {
    expect(personFidelityGate([finding()])).toBe("pass");
    expect(personFidelityGate([
      finding(),
      finding({ status: "mismatch", evidence: ["nariz divergente"], issue: "Estrutura facial divergente" }),
    ])).toBe("fail");
  });
});

describe("personFidelitySelectionGate", () => {
  it("returns null when no fidelity block is involved", () => {
    expect(personFidelitySelectionGate(null, OUTPUT)).toBeNull();
  });

  it("blocks confirmed mismatch even with an accepted review", () => {
    const referenceHash = HASH;
    expect(personFidelitySelectionGate({
      findings: [finding({ status: "mismatch", evidence: ["rosto trocado"], issue: "Pessoa trocada" })],
      referenceHash,
      review: { actorId: "u", at: new Date().toISOString(), outputId: OUTPUT, referenceHash, accepted: true },
    }, OUTPUT)).toBe("blocked");
  });

  it("resolves inconclusive only with a review bound to this output and hash", () => {
    const referenceHash = HASH;
    const block = {
      findings: [finding({ status: "inconclusive", issue: "Rosto ocluído" })],
      referenceHash,
    } as const;
    expect(personFidelitySelectionGate({ ...block, findings: [...block.findings] }, OUTPUT)).toBe("needs_review");
    const accepted = {
      ...block,
      findings: [...block.findings],
      review: { actorId: "u", at: new Date().toISOString(), outputId: OUTPUT, referenceHash, accepted: true },
    };
    expect(personFidelitySelectionGate(accepted, OUTPUT)).toBe("selectable");
    // Review of another image is worthless.
    expect(personFidelitySelectionGate(accepted, "33333333-3333-4333-8333-333333333333")).toBe("needs_review");
    // Stale reference hash is worthless.
    expect(personFidelitySelectionGate({
      ...accepted,
      review: { ...accepted.review, referenceHash: "a".repeat(64) },
    }, OUTPUT)).toBe("needs_review");
  });

  it("blocks on a bound negative review", () => {
    const referenceHash = HASH;
    expect(personFidelitySelectionGate({
      findings: [finding({ status: "inconclusive", issue: "Rosto ocluído" })],
      referenceHash,
      review: { actorId: "u", at: new Date().toISOString(), outputId: OUTPUT, referenceHash, accepted: false },
    }, OUTPUT)).toBe("blocked");
  });
});

describe("resolvePersonFidelity", () => {
  it("reads the block from quality and rejects malformed payloads", () => {
    const referenceHash = HASH;
    const block = { findings: [finding()], referenceHash };
    expect(resolvePersonFidelity({ schemaVersion: 1, personFidelity: block })).toEqual(block);
    expect(resolvePersonFidelity({ schemaVersion: 1 })).toBeNull();
    expect(resolvePersonFidelity(null)).toBeNull();
    expect(resolvePersonFidelity({ personFidelity: { findings: [] } })).toBeNull();
  });
});

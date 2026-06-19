import { describe, expect, it } from "vitest";
import {
  buildCalibrationRow,
  buildCenbrapCalibrationReport,
  classifyAgreement,
  normalizeDerivationRow,
  normalizeHumanDecisionFromEvent,
} from "./cenbrap-calibration";

function makeDerivation(overrides: Record<string, unknown> = {}) {
  return normalizeDerivationRow({
    id: "deriv-1",
    campaignId: "camp-1",
    workspaceId: "ws-1",
    status: "completed",
    outputKey: "workspace/ws/outputs/abc.png",
    olharVerdict: {
      value: "pronta",
      axes: { figura: 2, gestalt: 2, voz: 2, convite: 2 },
      whatWorks: ["clear focal point"],
      whatBlocks: [],
      directionNote: "Strong gestalt",
      source: "quality_gate",
      evaluatedAt: "2026-06-19T10:00:00.000Z",
    },
    exportStatus: {
      value: "ok",
      issues: [],
      setupIssues: [],
      evaluatedAt: "2026-06-19T10:00:00.000Z",
    },
    ...overrides,
  });
}

function makeHumanFromAction(
  action: "approved" | "rejected" | "regenerated",
  snapshot: Record<string, unknown> = {}
) {
  return normalizeHumanDecisionFromEvent({
    id: "event-1",
    userId: "jhonatan",
    createdAt: new Date("2026-06-19T11:00:00.000Z"),
    action,
    contextSnapshot: snapshot,
  });
}

describe("cenbrap-calibration", () => {
  describe("classifyAgreement", () => {
    it("agrees on pronta + entra", () => {
      expect(
        classifyAgreement({
          olharVerdict: "pronta",
          exportStatus: "ok",
          humanDecision: "entra",
        })
      ).toBe("agree");
    });

    it("agrees on confusa + nao_entra", () => {
      expect(
        classifyAgreement({
          olharVerdict: "confusa",
          exportStatus: "ok",
          humanDecision: "nao_entra",
        })
      ).toBe("agree");
    });

    it("flags mismatch on confusa + entra", () => {
      expect(
        classifyAgreement({
          olharVerdict: "confusa",
          exportStatus: "ok",
          humanDecision: "entra",
        })
      ).toBe("mismatch");
    });

    it("separates export bloqueado from art-direction entra", () => {
      expect(
        classifyAgreement({
          olharVerdict: "pronta",
          exportStatus: "bloqueado",
          humanDecision: "entra",
        })
      ).toBe("mismatch");
    });

    it("treats override-approved entra as exception evidence", () => {
      expect(
        classifyAgreement({
          olharVerdict: "confusa",
          exportStatus: "bloqueado",
          humanDecision: "entra",
          overrideApproved: true,
        })
      ).toBe("agree");
    });

    it("marks missing dual verdict without inferring agreement", () => {
      expect(
        classifyAgreement({
          olharVerdict: null,
          exportStatus: "ok",
          humanDecision: "entra",
        })
      ).toBe("missing_dual_verdict");
    });

    it("marks missing human decision explicitly", () => {
      expect(
        classifyAgreement({
          olharVerdict: "pronta",
          exportStatus: "ok",
          humanDecision: null,
        })
      ).toBe("missing_human_decision");
    });
  });

  describe("normalizeDerivationRow", () => {
    it("treats missing olharVerdict/exportStatus as missing evidence", () => {
      const row = makeDerivation({ olharVerdict: null, exportStatus: null });
      expect(row.dualVerdictState).toBe("missing_dual_verdict");
      expect(row.olharVerdictValue).toBeNull();
      expect(row.exportStatusValue).toBeNull();
    });

    it("keeps export bloqueado distinct from olhar verdict", () => {
      const row = makeDerivation({
        olharVerdict: {
          value: "pronta",
          axes: { figura: 2, gestalt: 2, voz: 2, convite: 2 },
          whatWorks: [],
          whatBlocks: [],
          directionNote: "Readable",
          source: "quality_gate",
          evaluatedAt: "2026-06-19T10:00:00.000Z",
        },
        exportStatus: {
          value: "bloqueado",
          issues: [{ code: "cta_missing", message: "CTA missing" }],
          setupIssues: [],
          evaluatedAt: "2026-06-19T10:00:00.000Z",
        },
      });

      expect(row.olharVerdictValue).toBe("pronta");
      expect(row.exportStatusValue).toBe("bloqueado");
      expect(row.packageEligible).toBe(false);
    });

    it("marks override-approved row as exception evidence", () => {
      const row = makeDerivation({
        status: "approved",
        olharVerdict: {
          value: "confusa",
          axes: { figura: 0, gestalt: 0, voz: 1, convite: 0 },
          whatWorks: [],
          whatBlocks: ["weak hierarchy"],
          directionNote: "Needs rework",
          source: "quality_gate",
          evaluatedAt: "2026-06-19T10:00:00.000Z",
        },
        exportStatus: {
          value: "bloqueado",
          issues: [{ code: "cta_missing", message: "CTA missing" }],
          setupIssues: [],
          evaluatedAt: "2026-06-19T10:00:00.000Z",
        },
      });

      expect(row.approvalOverride).toBe(true);
      expect(row.packageEligible).toBe(true);
    });
  });

  describe("buildCalibrationRow", () => {
    it("builds comparable row for pronta + entra", () => {
      const row = buildCalibrationRow({
        derivation: makeDerivation(),
        human: makeHumanFromAction("approved"),
      });

      expect(row.agreement).toBe("agree");
      expect(row.human.humanDecision).toBe("entra");
    });

    it("captures mismatch reason from decision event", () => {
      const row = buildCalibrationRow({
        derivation: makeDerivation({
          olharVerdict: {
            value: "confusa",
            axes: { figura: 0, gestalt: 0, voz: 0, convite: 0 },
            whatWorks: [],
            whatBlocks: ["generic layout"],
            directionNote: "Template feel",
            source: "quality_gate",
            evaluatedAt: "2026-06-19T10:00:00.000Z",
          },
        }),
        human: makeHumanFromAction("rejected", {
          reason: {
            code: "nao_entra",
            text: "Hierarchy still weak",
            source: "direction_reason",
          },
        }),
      });

      expect(row.agreement).toBe("agree");
      expect(row.human.mismatchReason).toBe("Hierarchy still weak");
    });
  });

  describe("buildCenbrapCalibrationReport", () => {
    it("withholds agreement rate when sample is insufficient", () => {
      const report = buildCenbrapCalibrationReport({
        capturedAt: "2026-06-19T12:00:00.000Z",
        mode: "live",
        campaigns: [
          {
            campaign: {
              id: "camp-1",
              workspaceId: "ws-1",
              name: "CENBRAP NR1",
              client: "Cenbrap",
              clientProfileId: null,
              clientProfileName: null,
              status: "completed",
              selectionSignals: ["client_contains_cenbrap"],
            },
            rows: [
              buildCalibrationRow({
                derivation: makeDerivation(),
                human: makeHumanFromAction("approved"),
              }),
            ],
          },
        ],
      });

      expect(report.status).toBe("insufficient_sample");
      expect(report.metrics.agreementRate).toBe(1);
      expect(report.sampleGuidance.length).toBeGreaterThan(0);
    });
  });
});

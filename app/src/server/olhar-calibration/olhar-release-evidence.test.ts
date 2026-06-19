import { describe, expect, it } from "vitest";
import {
  buildCalibrationRow,
  buildCenbrapCalibrationReport,
  normalizeDerivationRow,
  normalizeHumanDecisionFromEvent,
} from "./cenbrap-calibration";
import {
  BLENDED_FIELD_DENYLIST,
  buildOlharReleaseEvidence,
  buildTemplateOlharReleaseEvidence,
  isSampleGuidanceBlocked,
  resolveAgreementRateForEvidence,
} from "./olhar-release-evidence";

function makeDerivation(id: string, campaignId: string) {
  return normalizeDerivationRow({
    id,
    campaignId,
    workspaceId: "ws-1",
    status: "completed",
    outputKey: `workspace/ws/outputs/${id}.png`,
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
  });
}

function makeApprovedHuman() {
  return normalizeHumanDecisionFromEvent({
    id: "event-1",
    userId: "jhonatan",
    createdAt: new Date("2026-06-19T11:00:00.000Z"),
    action: "approved",
    contextSnapshot: {},
  });
}

function makeCampaignSection(
  campaignId: string,
  name: string,
  derivationIds: string[]
) {
  return {
    campaign: {
      id: campaignId,
      workspaceId: "ws-1",
      name,
      client: "Cenbrap",
      clientProfileId: null,
      clientProfileName: null,
      status: "completed",
      selectionSignals: ["client_contains_cenbrap"],
    },
    rows: derivationIds.map((derivationId) =>
      buildCalibrationRow({
        derivation: makeDerivation(derivationId, campaignId),
        human: {
          ...makeApprovedHuman(),
          derivationId,
          decisionEventId: `event-${derivationId}`,
        },
      })
    ),
  };
}

describe("olhar-release-evidence", () => {
  it("withholds agreement rate when sample guidance blocks claims", () => {
    const calibration = buildCenbrapCalibrationReport({
      capturedAt: "2026-06-19T12:00:00.000Z",
      mode: "live",
      campaigns: [makeCampaignSection("camp-1", "CENBRAP NR1", ["deriv-1"])],
    });

    const evidence = buildOlharReleaseEvidence({
      calibration,
      capturedAt: "2026-06-19T12:30:00.000Z",
      calibrationSourcePath:
        ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.template.json",
    });

    expect(evidence.status).toBe("insufficient_sample");
    expect(evidence.artDirectionMetrics.agreementRate).toBeNull();
    expect(evidence.qualityImprovementClaimed).toBeNull();
    expect(evidence.sampleGuidance.length).toBeGreaterThan(0);
    expect(isSampleGuidanceBlocked(evidence.sampleGuidance)).toBe(true);
    expect(resolveAgreementRateForEvidence({
      agreementRate: 1,
      sampleGuidance: evidence.sampleGuidance,
    })).toBeNull();
  });

  it("reports agreement when sample is sufficient across two campaigns", () => {
    const calibration = buildCenbrapCalibrationReport({
      capturedAt: "2026-06-19T12:00:00.000Z",
      mode: "live",
      campaigns: [
        makeCampaignSection("camp-1", "CENBRAP NR1", [
          "deriv-1",
          "deriv-2",
          "deriv-3",
        ]),
        makeCampaignSection("camp-2", "CENBRAP EM DOBRO", [
          "deriv-4",
          "deriv-5",
        ]),
      ],
    });

    const evidence = buildOlharReleaseEvidence({
      calibration,
      capturedAt: "2026-06-19T12:30:00.000Z",
      calibrationSourcePath:
        ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json",
      technicalVerification: {
        phases138to141: "pass",
        note: "Automated verification green for phases 138-141.",
      },
    });

    expect(calibration.status).toBe("ok");
    expect(evidence.status).toBe("ok");
    expect(evidence.artDirectionMetrics.agreementRate).toBe(1);
    expect(evidence.artDirectionMetrics.humanDecisionCount).toBe(5);
    expect(evidence.artDirectionMetrics.evaluatedCampaignCount).toBe(2);
    expect(evidence.factualExportMetrics.approvedInvalidPreventedCount).toBe(0);
    expect(evidence.requirements.every((entry) => entry.result === "pass")).toBe(
      true
    );
  });

  it("keeps factual/export metrics separate from art-direction metrics", () => {
    const evidence = buildTemplateOlharReleaseEvidence(
      "2026-06-19T13:00:00.000Z",
      {
        calibrationSourcePath:
          ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.template.json",
        contactSheetPath:
          ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CONTACT-SHEET.md",
      }
    );

    expect(evidence.status).toBe("template");
    expect(evidence.artDirectionMetrics.evidenceSource).toBe("live_human");
    expect(evidence.factualExportMetrics.evidenceSource).toBe("live_human");
    expect(evidence.artDirectionMetrics.denominatorNote).not.toBe(
      evidence.factualExportMetrics.denominatorNote
    );
    expect(evidence.artDirectionMetrics).not.toHaveProperty(
      "approvedInvalidPreventedCount"
    );
    expect(evidence.factualExportMetrics).not.toHaveProperty("agreementRate");

    for (const field of BLENDED_FIELD_DENYLIST) {
      expect(evidence).not.toHaveProperty(field);
    }
  });

  it("marks human_needed when derivations exist without operator decisions", () => {
    const calibration = buildCenbrapCalibrationReport({
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
              derivation: makeDerivation("deriv-1", "camp-1"),
              human: {
                derivationId: "deriv-1",
                humanDecision: null,
                humanDecisionSource: "manual_pending",
                mismatchBucket: null,
                mismatchReason: null,
                reviewer: null,
                reviewedAt: null,
                decisionEventId: null,
                overrideApproved: false,
              },
            }),
          ],
        },
      ],
    });

    const evidence = buildOlharReleaseEvidence({
      calibration,
      capturedAt: "2026-06-19T12:30:00.000Z",
      calibrationSourcePath:
        ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json",
    });

    expect(evidence.status).toBe("human_needed");
    expect(evidence.artDirectionMetrics.agreementRate).toBeNull();
    expect(evidence.requirements.some((entry) => entry.result === "human_needed")).toBe(
      true
    );
  });
});

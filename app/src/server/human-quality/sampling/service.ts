import { runScoreCalibration } from "../calibration/service";
import { runLearningImpact } from "../impact/service";
import { runQualityImprovement } from "../improvement/service";
import { buildSampleCoverageReport, type SampleCoverageReport } from "./coverage";

export interface RunSampleCoverageInput {
  workspaceId?: string;
  cohort?: string;
  capturedAt?: string;
}

export interface RunSampleCoverageResult {
  report: SampleCoverageReport;
}

export async function runSampleCoverage(
  input: RunSampleCoverageInput = {}
): Promise<RunSampleCoverageResult> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();

  const [calibrationResult, impactResult, qualityResult] = await Promise.all([
    runScoreCalibration({
      workspaceId: input.workspaceId,
      cohort: input.cohort,
      capturedAt,
    }),
    runLearningImpact({
      workspaceId: input.workspaceId,
      cohort: input.cohort,
      capturedAt,
    }),
    runQualityImprovement({
      workspaceId: input.workspaceId,
      cohort: input.cohort,
      capturedAt,
    }),
  ]);

  const report = buildSampleCoverageReport({
    capturedAt,
    calibration: {
      status: calibrationResult.report.status,
      evaluatedItemCount: calibrationResult.report.evaluatedItemCount,
      sampleGuidance: calibrationResult.report.sampleGuidance,
    },
    impact: {
      status: impactResult.report.status,
      evaluatedItemCount: impactResult.report.evaluatedItemCount,
      sampleGuidance: impactResult.report.sampleGuidance,
    },
    quality: {
      status: qualityResult.report.status,
      sampleGuidance: qualityResult.report.sampleGuidance,
    },
  });

  return { report };
}

export type { SampleCoverageReport } from "./coverage";

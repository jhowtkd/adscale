import { describe, expect, it } from "vitest";
import {
  baselineCoverageReport,
  productionPilotBaselineSchema,
} from "./production-pilot-baseline";

describe("production pilot baseline schema", () => {
  it("accepts a PreceptorIA-shaped controlled reference without image bytes", () => {
    const baseline = productionPilotBaselineSchema.parse({
      version: 1,
      pilotId: "preceptoria-2026-08",
      brandName: "PreceptorIA",
      provenance: { source: "manual_capture", operator: "qa" },
      requests: [
        {
          requestId: "r-text-45",
          requestText: "PreceptorIA já está disponível para teste",
          format: "4:5",
          contentPattern: "text_led_ad",
          effectivePrompt: "STANDALONE BRANDED SOCIAL POST…",
          selectedReferences: [
            { referenceId: "ref-1", reason: "registration_order slice(0,3)" },
          ],
          observedHardFailures: ["instruction_printed_as_copy", "brand_lettering_wrong"],
          humanVerdict: "fail",
          capturedAt: "2026-08-04T12:00:00.000Z",
        },
        {
          requestId: "r-data-916",
          requestText: "Dados de adesão do piloto",
          format: "9:16",
          contentPattern: "evidence_data",
          effectivePrompt: "…",
          selectedReferences: [],
          observedHardFailures: ["logo_absent"],
          humanVerdict: "fail",
          capturedAt: "2026-08-04T12:01:00.000Z",
        },
        {
          requestId: "r-inst-11",
          requestText: "Institucional com foto",
          format: "1:1",
          contentPattern: "institutional_photo",
          effectivePrompt: "…",
          selectedReferences: [],
          observedHardFailures: [],
          humanVerdict: "pending",
          capturedAt: "2026-08-04T12:02:00.000Z",
        },
      ],
    });

    const coverage = baselineCoverageReport(baseline);
    expect(coverage.meetsMinimum).toBe(true);
    expect(coverage.formats).toEqual(expect.arrayContaining(["1:1", "4:5", "9:16"]));
    expect(coverage.patterns).toHaveLength(3);
    // No image payload fields
    expect(JSON.stringify(baseline)).not.toMatch(/base64|imageBuffer|pngBytes/i);
  });

  it("flags incomplete coverage", () => {
    const baseline = productionPilotBaselineSchema.parse({
      version: 1,
      pilotId: "partial",
      brandName: "X",
      provenance: { source: "manual_capture" },
      requests: [
        {
          requestId: "only",
          requestText: "x",
          format: "1:1",
          contentPattern: "text_led_ad",
          effectivePrompt: "p",
          selectedReferences: [],
          observedHardFailures: [],
          humanVerdict: "pending",
          capturedAt: "2026-08-04T00:00:00.000Z",
        },
      ],
    });
    expect(baselineCoverageReport(baseline).meetsMinimum).toBe(false);
  });
});

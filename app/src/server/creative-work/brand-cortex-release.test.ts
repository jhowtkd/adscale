import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  brandCortexReleaseReviewSchema,
  createBrandCortexReviewTemplate,
  evaluateBrandCortexPilotPending,
  evaluateBrandCortexPilotReview,
  hashBrandCortexEvidence,
  inspectBrandCortexPilot,
  renderBrandCortexReviewHtml,
  verifyBrandCortexPilotArtifacts,
} from "./brand-cortex-release";

const sha = (char: string) => char.repeat(64);
const hashText = (value: string) => createHash("sha256").update(value).digest("hex");

function pilotArtifact(format: "1:1" | "4:5" | "9:16", index: number) {
  return {
    artifactId: `${format}-${index}`,
    workItemId: `work-${format}-${index}`,
    outputId: `output-${format}-${index}`,
    outputKey: `creative-work/output-${format}-${index}.png`,
    format,
    artifactPath: `artifacts/${format.replace(":", "x")}-${index}.png`,
    artifactSha256: sha(String(index)),
    prompt: "Gere uma peça coerente com a marca.",
    promptSha256: hashText("Gere uma peça coerente com a marca."),
    mimeType: "image/png" as const,
    byteLength: 1024,
    width: 1080,
    height: format === "1:1" ? 1080 : format === "4:5" ? 1350 : 1920,
    billingCredits: 5,
    identity: {
      snapshotSha256: sha("a"),
      brandKit: null as unknown,
      referenceAssetKeys: [],
      claimIds: [],
    },
    directionSnapshot: null,
    directionSnapshotSha256: null,
    provider: {
      name: "openai" as const,
      model: "gpt-image-2-2026-04-21",
      requestId: `req-${format}-${index}`,
      durationMs: 1_000,
      inputs: [],
    },
    deterministicFidelity: "proven" as const,
    residualFidelity: "clear" as const,
    brief: { theme: "Marca", objective: "Reconhecimento", audience: "Público", offer: null },
    copy: { headline: "Conheça", body: "Uma marca consistente.", cta: "Saiba mais" },
  };
}

function approvedPilot() {
  return {
    schemaVersion: 1 as const,
    reportType: "brand-cortex-real-pilot" as const,
    pilotId: "pilot-1",
    capturedAt: "2026-08-13T12:00:00.000Z",
    createdByUserId: "operator-1",
    workspaceId: "workspace-1",
    clientProfileId: "profile-1",
    paidGeneration: true as const,
    excludedCalls: [] as const,
    settlement: {
      kind: "internal_ledger_debit" as const,
      billedCredits: 30,
      internalDebit: true,
      refund: "unproven" as const,
      reason: "paid_generation_requires_raw_ledger_link",
      rawLedgerEvidence: {
        provider: "openai",
        reference: "provider-settlement:pilot-1",
        capturedAt: "2026-08-13T12:05:00.000Z",
        sha256: sha("c"),
      },
    },
    brandKnowledge: {
      versionId: "version-1",
      versionNumber: 1,
      versionHash: sha("b"),
    },
    coverage: {
      requiredFormats: ["1:1", "4:5", "9:16"] as const,
      minimumArtifactsPerFormat: 2 as const,
    },
    referenceAssets: [],
    brandKit: null as unknown,
    claims: [] as unknown[],
    artifacts: (["1:1", "4:5", "9:16"] as const).flatMap((format) => [
      pilotArtifact(format, 1),
      pilotArtifact(format, 2),
    ]),
  };
}

describe("Brand Cortex real-pilot review", () => {
  it("emits hash-bound coverage and integrity evidence before human review exists", () => {
    const pilot = approvedPilot();
    pilot.artifacts = pilot.artifacts.filter((artifact) => artifact.format !== "9:16" || artifact.artifactId !== "9:16-2");

    const pending = evaluateBrandCortexPilotPending({ pilot, artifactFailures: [] });

    expect(pending).toMatchObject({
      status: "human_needed",
      pilotSha256: hashBrandCortexEvidence(pilot),
      reviewSha256: null,
      coverage: {
        artifactsPerFormat: { "1:1": 2, "4:5": 2, "9:16": 1 },
        meetsMinimum: false,
      },
      integrity: { status: "pass", checkedFiles: 5, failures: [] },
    });
    expect(pending.pending).toContain("9:16: requires 2 real artifacts, found 1");
    expect(pending.pending).toContain("human review is missing");
  });

  it("keeps an unpaid legacy pilot readable and names the missing bypass settlement", () => {
    const pilot = approvedPilot();
    pilot.paidGeneration = false;
    delete (pilot as { settlement?: unknown }).settlement;

    const pending = evaluateBrandCortexPilotPending({ pilot, artifactFailures: [] });
    expect(pending.status).toBe("human_needed");
    expect(pending.pending).toContain("bypass settlement evidence is missing; internal debit is not a refund");
  });

  it("rejects a paid pilot without raw ledger evidence", () => {
    const pilot = approvedPilot();
    delete (pilot.settlement as { rawLedgerEvidence?: unknown }).rawLedgerEvidence;

    expect(() => createBrandCortexReviewTemplate(pilot)).toThrow("paid generation requires raw ledger evidence");
  });

  it("does not treat an approved asset as conforming when an explicit typography claim disagrees", () => {
    const pilot = approvedPilot();
    const brandKit = {
      fonts: ["Montserrat", "Open Sans"],
      fontAssets: [{ family: "Albert Sans" }],
    };
    pilot.brandKit = brandKit;
    pilot.claims = [{
      claimKey: "typography.families",
      authority: "explicit",
      confidence: "high",
      value: ["Montserrat", "Open Sans"],
    }];
    pilot.artifacts = pilot.artifacts.map((artifact) => ({
      ...artifact,
      identity: { ...artifact.identity, brandKit },
    }));

    const evidence = inspectBrandCortexPilot(pilot);
    expect(evidence.typography).toMatchObject({
      status: "conflict",
      precedence: "explicit_high_confidence_claim_over_approved_font_asset",
      declaredFamilies: ["Montserrat", "Open Sans"],
      appliedFamilies: ["Albert Sans"],
    });

    const review = createBrandCortexReviewTemplate(pilot);
    review.reviewerId = "reviewer-1";
    review.reviewedAt = "2026-08-13T13:00:00.000Z";
    review.artifacts = review.artifacts.map((artifact) => ({
      ...artifact,
      verdict: "pass",
      criteria: {
        brandRecognition: "pass",
        visualGrammar: "pass",
        paletteAndTypography: "pass",
        hierarchyAndComposition: "pass",
        assetUse: "pass",
        noInvention: "pass",
      },
    }));
    review.releaseDecision = { status: "approved", notes: "Aprovado." };

    expect(evaluateBrandCortexPilotReview({ pilot, review })).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining([
        expect.stringContaining("applied font family Albert Sans is outside explicit families"),
      ]),
    });
  });

  it("approves only a complete human review bound to the pilot and artifact hashes", () => {
    const pilot = approvedPilot();
    const review = {
      schemaVersion: 1 as const,
      reportType: "brand-cortex-release-review" as const,
      pilotId: pilot.pilotId,
      pilotSha256: hashBrandCortexEvidence(pilot),
      reviewerId: "reviewer-1",
      reviewedAt: "2026-08-13T13:00:00.000Z",
      artifacts: pilot.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactSha256: artifact.artifactSha256,
        verdict: "pass" as const,
        criteria: {
          brandRecognition: "pass" as const,
          visualGrammar: "pass" as const,
          paletteAndTypography: "pass" as const,
          hierarchyAndComposition: "pass" as const,
          assetUse: "pass" as const,
          noInvention: "pass" as const,
        },
        notes: null,
      })),
      releaseDecision: { status: "approved" as const, notes: "Aprovado para piloto." },
    };

    expect(evaluateBrandCortexPilotReview({ pilot, review })).toMatchObject({
      status: "approved",
      pilotSha256: review.pilotSha256,
      reviewSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      failures: [],
    });
  });

  it("fails when a review is copied to a changed pilot or artifact", () => {
    const pilot = approvedPilot();
    const review = {
      schemaVersion: 1 as const,
      reportType: "brand-cortex-release-review" as const,
      pilotId: pilot.pilotId,
      pilotSha256: sha("f"),
      reviewerId: "reviewer-1",
      reviewedAt: "2026-08-13T13:00:00.000Z",
      artifacts: pilot.artifacts.map((artifact, index) => ({
        artifactId: artifact.artifactId,
        artifactSha256: index === 0 ? sha("e") : artifact.artifactSha256,
        verdict: "pass" as const,
        criteria: {
          brandRecognition: "pass" as const,
          visualGrammar: "pass" as const,
          paletteAndTypography: "pass" as const,
          hierarchyAndComposition: "pass" as const,
          assetUse: "pass" as const,
          noInvention: "pass" as const,
        },
        notes: null,
      })),
      releaseDecision: { status: "approved" as const, notes: "Aprovado." },
    };

    expect(evaluateBrandCortexPilotReview({ pilot, review })).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining([
        "pilot hash does not match the reviewed manifest",
        "1:1-1: artifact hash does not match the reviewed manifest",
      ]),
    });
  });

  it("stays human-dependent until every pilot artifact is reviewed", () => {
    const pilot = approvedPilot();
    const review = {
      schemaVersion: 1 as const,
      reportType: "brand-cortex-release-review" as const,
      pilotId: pilot.pilotId,
      pilotSha256: hashBrandCortexEvidence(pilot),
      reviewerId: "reviewer-1",
      reviewedAt: "2026-08-13T13:00:00.000Z",
      artifacts: pilot.artifacts.slice(0, -1).map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactSha256: artifact.artifactSha256,
        verdict: "pass" as const,
        criteria: {
          brandRecognition: "pass" as const,
          visualGrammar: "pass" as const,
          paletteAndTypography: "pass" as const,
          hierarchyAndComposition: "pass" as const,
          assetUse: "pass" as const,
          noInvention: "pass" as const,
        },
        notes: null,
      })),
      releaseDecision: { status: "approved" as const, notes: "Aprovado." },
    };

    expect(evaluateBrandCortexPilotReview({ pilot, review })).toMatchObject({
      status: "human_needed",
      pending: ["9:16-2: human review is missing"],
      failures: [],
    });
  });

  it("cannot approve controlled output or deterministic nonconformance", () => {
    const pilot = approvedPilot();
    pilot.artifacts[0] = {
      ...pilot.artifacts[0]!,
      provider: { ...pilot.artifacts[0]!.provider, model: "gpt-image-2-e2e-controlled" },
      deterministicFidelity: "nonconforming",
    };
    const review = {
      schemaVersion: 1 as const,
      reportType: "brand-cortex-release-review" as const,
      pilotId: pilot.pilotId,
      pilotSha256: hashBrandCortexEvidence(pilot),
      reviewerId: "reviewer-1",
      reviewedAt: "2026-08-13T13:00:00.000Z",
      artifacts: pilot.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactSha256: artifact.artifactSha256,
        verdict: "pass" as const,
        criteria: {
          brandRecognition: "pass" as const,
          visualGrammar: "pass" as const,
          paletteAndTypography: "pass" as const,
          hierarchyAndComposition: "pass" as const,
          assetUse: "pass" as const,
          noInvention: "pass" as const,
        },
        notes: null,
      })),
      releaseDecision: { status: "approved" as const, notes: "Aprovado." },
    };

    expect(evaluateBrandCortexPilotReview({ pilot, review })).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining([
        "1:1-1: controlled provider cannot prove real visual quality",
        "1:1-1: deterministic brand fidelity is nonconforming",
      ]),
    });
  });

  it("fails when the frozen prompt does not match its recorded hash", () => {
    const pilot = approvedPilot();
    pilot.artifacts[0] = { ...pilot.artifacts[0]!, prompt: "Prompt alterado depois da geração." };
    const review = createBrandCortexReviewTemplate(pilot);
    review.reviewerId = "reviewer-1";
    review.reviewedAt = "2026-08-13T13:00:00.000Z";
    review.releaseDecision = { status: "approved", notes: "Aprovado." };
    review.artifacts = review.artifacts.map((artifact) => ({
      ...artifact,
      verdict: "pass",
      criteria: {
        brandRecognition: "pass",
        visualGrammar: "pass",
        paletteAndTypography: "pass",
        hierarchyAndComposition: "pass",
        assetUse: "pass",
        noInvention: "pass",
      },
    }));

    expect(evaluateBrandCortexPilotReview({ pilot, review })).toMatchObject({
      status: "failed",
      failures: ["1:1-1: frozen prompt hash does not match"],
    });
  });

  it("fails when the human reviewer rejects an artifact or the release", () => {
    const pilot = approvedPilot();
    const review = {
      schemaVersion: 1 as const,
      reportType: "brand-cortex-release-review" as const,
      pilotId: pilot.pilotId,
      pilotSha256: hashBrandCortexEvidence(pilot),
      reviewerId: "reviewer-1",
      reviewedAt: "2026-08-13T13:00:00.000Z",
      artifacts: pilot.artifacts.map((artifact, index) => ({
        artifactId: artifact.artifactId,
        artifactSha256: artifact.artifactSha256,
        verdict: index === 0 ? "fail" as const : "pass" as const,
        criteria: {
          brandRecognition: index === 0 ? "fail" as const : "pass" as const,
          visualGrammar: "pass" as const,
          paletteAndTypography: "pass" as const,
          hierarchyAndComposition: "pass" as const,
          assetUse: "pass" as const,
          noInvention: "pass" as const,
        },
        notes: index === 0 ? "A marca não está reconhecível." : null,
      })),
      releaseDecision: { status: "rejected" as const, notes: "Corrigir antes do rollout." },
    };

    expect(evaluateBrandCortexPilotReview({ pilot, review })).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining([
        "1:1-1: human verdict is fail",
        "1:1-1: brandRecognition is fail",
        "human release decision is rejected",
      ]),
    });
  });

  it("keeps release pending until two real artifacts exist for every required format", () => {
    const pilot = approvedPilot();
    pilot.artifacts = pilot.artifacts.filter((artifact) => artifact.artifactId !== "9:16-2");
    const review = {
      schemaVersion: 1 as const,
      reportType: "brand-cortex-release-review" as const,
      pilotId: pilot.pilotId,
      pilotSha256: hashBrandCortexEvidence(pilot),
      reviewerId: "reviewer-1",
      reviewedAt: "2026-08-13T13:00:00.000Z",
      artifacts: pilot.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactSha256: artifact.artifactSha256,
        verdict: "pass" as const,
        criteria: {
          brandRecognition: "pass" as const,
          visualGrammar: "pass" as const,
          paletteAndTypography: "pass" as const,
          hierarchyAndComposition: "pass" as const,
          assetUse: "pass" as const,
          noInvention: "pass" as const,
        },
        notes: null,
      })),
      releaseDecision: { status: "approved" as const, notes: "Aprovado." },
    };

    expect(evaluateBrandCortexPilotReview({ pilot, review })).toMatchObject({
      status: "human_needed",
      pending: ["9:16: requires 2 real artifacts, found 1"],
      failures: [],
    });
  });

  it("does not let a duplicated output satisfy the pilot coverage", () => {
    const pilot = approvedPilot();
    pilot.artifacts[1] = {
      ...pilot.artifacts[0]!,
      artifactId: "1:1-duplicate",
    };

    expect(() => createBrandCortexReviewTemplate(pilot)).toThrow("pilot outputId values must be unique");
  });

  it("rejects duplicate bytes, wrong dimensions and non-GPT-Image-2 evidence", () => {
    const duplicate = approvedPilot();
    duplicate.artifacts[1]!.artifactSha256 = duplicate.artifacts[0]!.artifactSha256;
    expect(() => createBrandCortexReviewTemplate(duplicate)).toThrow("artifact hashes must be unique within each format");

    const wrongDimensions = approvedPilot();
    wrongDimensions.artifacts[0]!.height = 1350;
    expect(() => createBrandCortexReviewTemplate(wrongDimensions)).toThrow("dimensions do not match format 1:1");

    const wrongModel = approvedPilot();
    wrongModel.artifacts[0]!.provider.model = "gpt-image-1";
    expect(() => createBrandCortexReviewTemplate(wrongModel)).toThrow("provider model must be GPT Image 2");

    const unpaid = approvedPilot();
    unpaid.artifacts[0]!.billingCredits = 0;
    expect(() => createBrandCortexReviewTemplate(unpaid)).toThrow("Number must be greater than 0");

    const legacyUnpaid = approvedPilot();
    legacyUnpaid.paidGeneration = false;
    delete (legacyUnpaid as { settlement?: unknown }).settlement;
    expect(() => createBrandCortexReviewTemplate(legacyUnpaid)).not.toThrow();

    const unpaidWithDebit = approvedPilot();
    unpaidWithDebit.paidGeneration = false;
    unpaidWithDebit.settlement = {
      kind: "internal_ledger_debit",
      billedCredits: 5,
      internalDebit: true,
      refund: "unproven",
      reason: "internal_debit_is_not_raw_provider_settlement",
    };
    expect(() => createBrandCortexReviewTemplate(unpaidWithDebit)).toThrow("unpaid real-provider pilots must record bypass settlement without internal debit or refund");

    const missingIds = approvedPilot();
    missingIds.excludedCalls = [
      { requestId: "requestIdMissing", status: "failed", attempt: 0, outputId: missingIds.artifacts[0]!.outputId },
      { requestId: "requestIdMissing", status: "failed", attempt: 1, outputId: missingIds.artifacts[0]!.outputId },
    ];
    expect(() => createBrandCortexReviewTemplate(missingIds)).not.toThrow();
  });

  it("requires a reviewer note for every non-pass verdict", () => {
    const pilot = approvedPilot();
    const parsed = brandCortexReleaseReviewSchema.safeParse({
      schemaVersion: 1,
      reportType: "brand-cortex-release-review",
      pilotId: pilot.pilotId,
      pilotSha256: hashBrandCortexEvidence(pilot),
      reviewerId: "reviewer-1",
      reviewedAt: "2026-08-13T13:00:00.000Z",
      artifacts: [{
        artifactId: pilot.artifacts[0]!.artifactId,
        artifactSha256: pilot.artifacts[0]!.artifactSha256,
        verdict: "needs_changes",
        criteria: {
          brandRecognition: "needs_changes",
          visualGrammar: "pass",
          paletteAndTypography: "pass",
          hierarchyAndComposition: "pass",
          assetUse: "pass",
          noInvention: "pass",
        },
        notes: null,
      }],
      releaseDecision: { status: "rejected", notes: "Corrigir." },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe("notes are required for non-pass review");
  });

  it("builds a self-contained review page and hash-bound review template", () => {
    const pilot = approvedPilot();
    pilot.referenceAssets = [{
      assetKey: "brand/logo.png",
      path: "artifacts/reference-1.png",
      sha256: sha("c"),
      label: "Logo principal",
      category: "logo",
      usageMode: "exact",
      mimeType: "image/png",
    }];
    const template = createBrandCortexReviewTemplate(pilot);
    const html = renderBrandCortexReviewHtml(pilot);

    expect(template).toMatchObject({
      pilotId: pilot.pilotId,
      pilotSha256: hashBrandCortexEvidence(pilot),
      reviewerId: "",
      artifacts: expect.arrayContaining([
        expect.objectContaining({ artifactId: "1:1-1", artifactSha256: sha("1") }),
      ]),
    });
    expect(html).toContain("artifacts/1x1-1.png");
    expect(html).toContain("artifacts/reference-1.png");
    expect(html).toContain("Gere uma peça coerente com a marca.");
    expect(html).toContain("Diretrizes e evidências");
    expect(html).toContain("brandRecognition");
    expect(html).toContain("Baixar revisão JSON");
  });

  it("invalidates a review when a packaged artifact changes on disk", () => {
    const pilot = approvedPilot();
    for (const artifact of pilot.artifacts) {
      artifact.artifactSha256 = hashText(artifact.artifactPath);
    }
    pilot.referenceAssets = [{
      assetKey: "brand/logo.png",
      path: "artifacts/reference-1.png",
      sha256: hashText("artifacts/reference-1.png"),
      label: "Logo principal",
      category: "logo",
      usageMode: "exact",
      mimeType: "image/png",
    }];

    expect(verifyBrandCortexPilotArtifacts(pilot, (artifactPath) =>
      Buffer.from(artifactPath === "artifacts/1x1-1.png" ? "modified" : artifactPath),
    )).toEqual(["artifacts/1x1-1.png: packaged file hash does not match the pilot manifest"]);
  });
});

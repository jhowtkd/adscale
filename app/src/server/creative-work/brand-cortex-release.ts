import { createHash } from "node:crypto";

import { z } from "zod";

import { getTargetDimensions } from "@/lib/formats";
import { canonicalJsonStringify } from "./canonical-json";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const brandCortexRawLedgerEvidenceSchema = z.object({
  provider: z.string().min(1),
  reference: z.string().min(1),
  capturedAt: z.string().datetime(),
  sha256: sha256Schema,
});
const packagedArtifactPathSchema = z.string().regex(/^artifacts\/[A-Za-z0-9._-]+$/);
const formatSchema = z.enum(["1:1", "4:5", "9:16"]);
const reviewCriterionSchema = z.enum(["pass", "fail", "needs_changes"]);
const brandCortexArtifactReviewSchema = z.object({
  artifactId: z.string().min(1),
  artifactSha256: sha256Schema,
  verdict: reviewCriterionSchema,
  criteria: z.object({
    brandRecognition: reviewCriterionSchema,
    visualGrammar: reviewCriterionSchema,
    paletteAndTypography: reviewCriterionSchema,
    hierarchyAndComposition: reviewCriterionSchema,
    assetUse: reviewCriterionSchema,
    noInvention: reviewCriterionSchema,
  }),
  notes: z.string().nullable(),
  /**
   * ICE-05A: who cast the verdict. Optional so historical reviews parse;
   * agent and automatic-score verdicts fail evaluation loudly.
   */
  decidedBy: z.enum(["human", "agent", "auto_score"]).nullish(),
}).superRefine((review, context) => {
  const nonPass = review.verdict !== "pass"
    || Object.values(review.criteria).some((verdict) => verdict !== "pass");
  if (nonPass && !review.notes?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["notes"],
      message: "notes are required for non-pass review",
    });
  }
  if (review.decidedBy === "agent" || review.decidedBy === "auto_score") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["decidedBy"],
      message: "agent and automatic-score verdicts never count as human review",
    });
  }
});

export const brandCortexPilotManifestSchema = z.object({
  schemaVersion: z.literal(1),
  reportType: z.literal("brand-cortex-real-pilot"),
  pilotId: z.string().min(1),
  capturedAt: z.string().datetime(),
  createdByUserId: z.string().min(1),
  workspaceId: z.string().min(1),
  clientProfileId: z.string().min(1),
  realProviderExecuted: z.literal(true).optional(),
  paidGeneration: z.boolean(),
  excludedCalls: z.array(z.object({
    requestId: z.string().min(1),
    status: z.enum(["failed", "rejected"]),
    attempt: z.number().int().nonnegative(),
    outputId: z.string().min(1),
    durationMs: z.number().nonnegative().optional(),
    error: z.string().min(1).optional(),
  })).default([]),
  settlement: z.object({
    kind: z.enum(["unlimited_billing_bypass", "internal_ledger_debit"]),
    billedCredits: z.number().int().nonnegative(),
    listedCredits: z.number().int().nonnegative().optional(),
    internalDebit: z.boolean(),
    refund: z.enum(["not_applicable", "unproven"]),
    reason: z.string().min(1),
    rawLedgerEvidence: brandCortexRawLedgerEvidenceSchema.optional(),
  }).optional(),
  brandKnowledge: z.object({
    versionId: z.string().min(1),
    versionNumber: z.number().int().positive(),
    versionHash: sha256Schema,
  }),
  coverage: z.object({
    requiredFormats: z.tuple([
      z.literal("1:1"),
      z.literal("4:5"),
      z.literal("9:16"),
    ]),
    minimumArtifactsPerFormat: z.literal(2),
  }),
  referenceAssets: z.array(z.object({
    assetKey: z.string().min(1),
    path: packagedArtifactPathSchema,
    sha256: sha256Schema,
    label: z.string().min(1),
    category: z.string().min(1),
    usageMode: z.string().min(1),
    mimeType: z.string().min(1),
  })),
  brandKit: z.unknown().nullable(),
  claims: z.array(z.unknown()),
  artifacts: z.array(z.object({
    artifactId: z.string().min(1),
    workItemId: z.string().min(1),
    outputId: z.string().min(1),
    outputKey: z.string().min(1),
    format: formatSchema,
    artifactPath: packagedArtifactPathSchema,
    artifactSha256: sha256Schema,
    prompt: z.string().min(1),
    promptSha256: sha256Schema,
    mimeType: z.literal("image/png"),
    byteLength: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    billingCredits: z.number().int().positive(),
    identity: z.object({
      snapshotSha256: sha256Schema,
      brandKit: z.unknown().nullable(),
      referenceAssetKeys: z.array(z.string().min(1)),
      claimIds: z.array(z.string().min(1)),
    }),
    directionSnapshot: z.object({
      label: z.string().min(1),
      instruction: z.string().min(1),
      order: z.number().int().nonnegative(),
      safetyBand: z.enum(["safe", "experimental"]).optional(),
    }).nullable(),
    directionSnapshotSha256: sha256Schema.nullable(),
    provider: z.object({
      name: z.literal("openai"),
      model: z.string().min(1),
      requestId: z.string().min(1),
      durationMs: z.number().nonnegative(),
      inputs: z.array(z.object({
        position: z.number().int().positive(),
        role: z.enum(["revision", "original", "content", "style", "piece_required", "piece_visual", "brand_identity"]),
        required: z.boolean(),
        assetKey: z.string().min(1),
        label: z.string().min(1),
        sourceMimeType: z.string().min(1),
        mimeType: z.string().min(1),
        sha256: sha256Schema,
      })),
    }),
    deterministicFidelity: z.enum(["proven", "nonconforming", "not_applicable"]),
    residualFidelity: z.enum(["clear", "suspected", "inconclusive"]),
    brief: z.object({
      theme: z.string(),
      objective: z.string(),
      audience: z.string(),
      offer: z.string().nullable(),
    }),
    copy: z.object({ headline: z.string(), body: z.string(), cta: z.string() }),
  })).min(1),
}).superRefine((pilot, context) => {
  const outputIds = pilot.artifacts.map((artifact) => artifact.outputId);
  if (new Set(outputIds).size !== outputIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts"], message: "pilot outputId values must be unique" });
  }
  const artifactIds = pilot.artifacts.map((artifact) => artifact.artifactId);
  if (new Set(artifactIds).size !== artifactIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts"], message: "pilot artifactId values must be unique" });
  }
  for (const format of pilot.coverage.requiredFormats) {
    const hashes = pilot.artifacts.filter((artifact) => artifact.format === format).map((artifact) => artifact.artifactSha256);
    if (new Set(hashes).size !== hashes.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts"], message: "artifact hashes must be unique within each format" });
    }
  }
  pilot.artifacts.forEach((artifact, index) => {
    const expected = getTargetDimensions(artifact.format);
    if (!expected || artifact.width !== expected.width || artifact.height !== expected.height) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index], message: `dimensions do not match format ${artifact.format}` });
    }
    if (!artifact.provider.model.startsWith("gpt-image-2")) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "provider", "model"], message: "provider model must be GPT Image 2" });
    }
    if (artifact.directionSnapshot === null !== (artifact.directionSnapshotSha256 === null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "directionSnapshotSha256"], message: "direction snapshot and hash must both be present or absent" });
    } else if (artifact.directionSnapshot && hashBrandCortexEvidence(artifact.directionSnapshot) !== artifact.directionSnapshotSha256) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "directionSnapshotSha256"], message: "direction snapshot hash does not match" });
    }
    if (artifact.provider.inputs.some((providerInput, inputIndex) => providerInput.position !== inputIndex + 1)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts", index, "provider", "inputs"], message: "provider input positions must be contiguous and ordered" });
    }
  });
  const artifactOutputIds = new Set(pilot.artifacts.map((artifact) => artifact.outputId));
  const excludedRequestIds = new Set<string>();
  pilot.excludedCalls.forEach((call, index) => {
    if (!artifactOutputIds.has(call.outputId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["excludedCalls", index, "outputId"], message: "excluded call must link to a pilot output" });
    }
    if (call.requestId !== "requestIdMissing" && excludedRequestIds.has(call.requestId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["excludedCalls", index, "requestId"], message: "excluded request IDs must be unique" });
    }
    excludedRequestIds.add(call.requestId);
  });
  if (pilot.settlement) {
    if (pilot.paidGeneration && pilot.settlement.kind === "unlimited_billing_bypass") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["settlement", "kind"],
        message: "paid generation cannot be recorded as a billing bypass",
      });
    }
    if (!pilot.paidGeneration && (pilot.settlement.kind !== "unlimited_billing_bypass" || pilot.settlement.internalDebit || pilot.settlement.refund !== "not_applicable")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["settlement"],
        message: "unpaid real-provider pilots must record bypass settlement without internal debit or refund",
      });
    }
    if (!pilot.paidGeneration && pilot.settlement.rawLedgerEvidence) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["settlement", "rawLedgerEvidence"],
        message: "raw ledger evidence requires paid generation",
      });
    }
    if (pilot.paidGeneration && !pilot.settlement.rawLedgerEvidence) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["settlement", "rawLedgerEvidence"],
        message: "paid generation requires raw ledger evidence",
      });
    }
  } else if (pilot.paidGeneration) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["settlement"],
      message: "paid generation requires settlement with raw ledger evidence",
    });
  }
});

export const brandCortexReleaseReviewSchema = z.object({
  schemaVersion: z.literal(1),
  reportType: z.literal("brand-cortex-release-review"),
  pilotId: z.string().min(1),
  pilotSha256: sha256Schema,
  reviewerId: z.string().min(1),
  reviewedAt: z.string().datetime(),
  artifacts: z.array(brandCortexArtifactReviewSchema),
  releaseDecision: z.object({
    status: z.enum(["approved", "rejected"]),
    notes: z.string().min(1),
  }),
}).superRefine((review, context) => {
  const artifactIds = review.artifacts.map((artifact) => artifact.artifactId);
  if (new Set(artifactIds).size !== artifactIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["artifacts"], message: "review artifactId values must be unique" });
  }
});

export type BrandCortexPilotManifest = z.infer<typeof brandCortexPilotManifestSchema>;
export type BrandCortexRawLedgerEvidence = z.infer<typeof brandCortexRawLedgerEvidenceSchema>;
export type BrandCortexReleaseReview = z.infer<typeof brandCortexReleaseReviewSchema>;

export function hashBrandCortexEvidence(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []))];
}

function fontFamiliesFromBrandKit(brandKit: unknown): string[] {
  const record = asRecord(brandKit);
  const assets = Array.isArray(record?.fontAssets) ? record.fontAssets : [];
  return uniqueStrings(assets.flatMap((asset) => {
    const family = asRecord(asset)?.family;
    return typeof family === "string" ? [family] : [];
  }));
}

function declaredTypographyFamilies(pilot: BrandCortexPilotManifest): string[] {
  const explicitClaims = pilot.claims.flatMap((claim) => {
    const record = asRecord(claim);
    if (
      record?.claimKey !== "typography.families"
      || record.authority !== "explicit"
      || record.confidence !== "high"
      || !Array.isArray(record.value)
    ) return [];
    return record.value;
  });
  if (explicitClaims.length > 0) return uniqueStrings(explicitClaims);
  const fonts = asRecord(pilot.brandKit)?.fonts;
  return uniqueStrings(Array.isArray(fonts) ? fonts : []);
}

export function inspectBrandCortexPilot(input: unknown, artifactFailures?: readonly string[]) {
  const pilot = brandCortexPilotManifestSchema.parse(input);
  const artifactsPerFormat = Object.fromEntries(pilot.coverage.requiredFormats.map((format) => [
    format,
    pilot.artifacts.filter((artifact) => artifact.format === format).length,
  ]));
  const coverage = {
    requiredFormats: pilot.coverage.requiredFormats,
    minimumArtifactsPerFormat: pilot.coverage.minimumArtifactsPerFormat,
    artifactsPerFormat,
    meetsMinimum: pilot.coverage.requiredFormats.every((format) =>
      artifactsPerFormat[format] >= pilot.coverage.minimumArtifactsPerFormat,
    ),
  };
  const integrityFailures = [...(artifactFailures ?? [])];
  const integrity = {
    status: artifactFailures === undefined
      ? "not_checked" as const
      : integrityFailures.length > 0 ? "fail" as const : "pass" as const,
    checkedFiles: artifactFailures === undefined ? 0 : pilot.artifacts.length + pilot.referenceAssets.length,
    failures: integrityFailures,
  };
  const declaredFamilies = declaredTypographyFamilies(pilot);
  const deterministicArtifacts = pilot.artifacts.filter((artifact) => artifact.deterministicFidelity === "proven");
  const appliedFamilies = uniqueStrings(deterministicArtifacts.flatMap((artifact) =>
    fontFamiliesFromBrandKit(artifact.identity.brandKit ?? pilot.brandKit),
  ));
  const typographyConflicts = deterministicArtifacts.flatMap((artifact) => {
    const applied = fontFamiliesFromBrandKit(artifact.identity.brandKit ?? pilot.brandKit);
    if (declaredFamilies.length === 0 && applied.length === 0) return [];
    if (declaredFamilies.length === 0) {
      return [`${artifact.artifactId}: no authoritative typography family is available`];
    }
    if (applied.length === 0) {
      return [`${artifact.artifactId}: deterministic typography has no applied font provenance`];
    }
    return applied
      .filter((family) => !declaredFamilies.some((declared) => declared.toLocaleLowerCase() === family.toLocaleLowerCase()))
      .map((family) => `${artifact.artifactId}: applied font family ${family} is outside explicit families ${declaredFamilies.join(", ")}`);
  });
  const typography = {
    status: deterministicArtifacts.length === 0 || (declaredFamilies.length === 0 && appliedFamilies.length === 0)
      ? "not_applicable" as const
      : typographyConflicts.length > 0 ? "conflict" as const : "pass" as const,
    precedence: "explicit_high_confidence_claim_over_approved_font_asset" as const,
    declaredFamilies,
    appliedFamilies,
    conflicts: typographyConflicts,
  };
  const provenancePending: string[] = [];
  if (pilot.paidGeneration === false && !pilot.settlement) {
    provenancePending.push("bypass settlement evidence is missing; internal debit is not a refund");
  }
  return {
    pilot,
    pilotSha256: hashBrandCortexEvidence(pilot),
    coverage,
    integrity,
    typography,
    provenancePending,
  };
}

export function evaluateBrandCortexPilotPending(input: { pilot: unknown; artifactFailures?: readonly string[] }) {
  const evidence = inspectBrandCortexPilot(input.pilot, input.artifactFailures);
  const pending = evidence.coverage.requiredFormats.flatMap((format) => {
    const count = evidence.coverage.artifactsPerFormat[format] ?? 0;
    return count < evidence.coverage.minimumArtifactsPerFormat
      ? [`${format}: requires ${evidence.coverage.minimumArtifactsPerFormat} real artifacts, found ${count}`]
      : [];
  });
  pending.push(...evidence.typography.conflicts.map((conflict) => `typography: ${conflict}`));
  pending.push(...evidence.provenancePending);
  pending.push("human review is missing");
  return {
    schemaVersion: 1 as const,
    reportType: "brand-cortex-human-release" as const,
    status: evidence.integrity.status === "fail" ? "failed" as const : "human_needed" as const,
    pilotId: evidence.pilot.pilotId,
    pilotSha256: evidence.pilotSha256,
    reviewSha256: null,
    reviewerId: null,
    reviewedAt: null,
    failures: evidence.integrity.failures,
    pending,
    coverage: evidence.coverage,
    integrity: evidence.integrity,
    typography: evidence.typography,
  };
}

export function verifyBrandCortexPilotArtifacts(
  input: unknown,
  readArtifact: (artifactPath: string) => Buffer,
): string[] {
  const pilot = brandCortexPilotManifestSchema.parse(input);
  const files = [
    ...pilot.artifacts.map((artifact) => ({ path: artifact.artifactPath, sha256: artifact.artifactSha256 })),
    ...pilot.referenceAssets.map((asset) => ({ path: asset.path, sha256: asset.sha256 })),
  ];
  return files.flatMap((file) => {
    try {
      return createHash("sha256").update(readArtifact(file.path)).digest("hex") === file.sha256
        ? []
        : [`${file.path}: packaged file hash does not match the pilot manifest`];
    } catch {
      return [`${file.path}: packaged file is missing or unreadable`];
    }
  });
}

const REVIEW_CRITERIA = [
  "brandRecognition",
  "visualGrammar",
  "paletteAndTypography",
  "hierarchyAndComposition",
  "assetUse",
  "noInvention",
] as const;

export function createBrandCortexReviewTemplate(input: unknown) {
  const pilot = brandCortexPilotManifestSchema.parse(input);
  return {
    schemaVersion: 1 as const,
    reportType: "brand-cortex-release-review" as const,
    pilotId: pilot.pilotId,
    pilotSha256: hashBrandCortexEvidence(pilot),
    reviewerId: "",
    reviewedAt: "",
    artifacts: pilot.artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      artifactSha256: artifact.artifactSha256,
      verdict: null,
      criteria: Object.fromEntries(REVIEW_CRITERIA.map((criterion) => [criterion, null])),
      notes: null,
      decidedBy: null,
    })),
    releaseDecision: { status: null, notes: "" },
  };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderBrandCortexReviewHtml(input: unknown): string {
  const pilot = brandCortexPilotManifestSchema.parse(input);
  const template = createBrandCortexReviewTemplate(pilot);
  const options = '<option value="">Selecione</option><option value="pass">Pass</option><option value="needs_changes">Needs changes</option><option value="fail">Fail</option>';
  const cards = pilot.artifacts.map((artifact) => `
    <article class="card" data-artifact-id="${escapeHtml(artifact.artifactId)}">
      <img src="${escapeHtml(artifact.artifactPath)}" alt="Peça ${escapeHtml(artifact.artifactId)}">
      <div class="content">
        <h2>${escapeHtml(artifact.format)} · ${escapeHtml(artifact.artifactId)}</h2>
        <p><strong>Headline:</strong> ${escapeHtml(artifact.copy.headline)}</p>
        <p><strong>Body:</strong> ${escapeHtml(artifact.copy.body)}</p>
        <p><strong>CTA:</strong> ${escapeHtml(artifact.copy.cta)}</p>
        <p><strong>Modelo:</strong> ${escapeHtml(artifact.provider.model)} · <strong>hash:</strong> <code>${escapeHtml(artifact.artifactSha256)}</code></p>
        <p><strong>Direção:</strong> ${escapeHtml(artifact.directionSnapshot ? `${artifact.directionSnapshot.label} — ${artifact.directionSnapshot.instruction}` : "Sem direção congelada")}</p>
        <p><strong>Assets aplicáveis:</strong> ${escapeHtml(artifact.identity.referenceAssetKeys.join(", ") || "nenhum")} · <strong>claims:</strong> ${escapeHtml(artifact.identity.claimIds.join(", ") || "nenhum")}</p>
        <p><strong>Brand Kit do snapshot:</strong> <code>${escapeHtml(JSON.stringify(artifact.identity.brandKit))}</code></p>
        <details><summary>Inputs enviados ao provider</summary><pre>${escapeHtml(JSON.stringify(artifact.provider.inputs, null, 2))}</pre></details>
        <details><summary>Prompt congelado</summary><pre>${escapeHtml(artifact.prompt)}</pre></details>
        <label>Veredito<select data-field="verdict">${options}</select></label>
        <div class="criteria">${REVIEW_CRITERIA.map((criterion) => `<label>${criterion}<select data-criterion="${criterion}">${options}</select></label>`).join("")}</div>
        <label>Notas<textarea data-field="notes" placeholder="Obrigatório quando algo não passar"></textarea></label>
      </div>
    </article>`).join("");
  const embedded = JSON.stringify(template).replaceAll("<", "\\u003c");
  const references = pilot.referenceAssets.map((asset) => `<figure><img src="${escapeHtml(asset.path)}" alt="${escapeHtml(asset.label)}"><figcaption>${escapeHtml(asset.label)} · ${escapeHtml(asset.category)} · ${escapeHtml(asset.usageMode)}<br><code>${escapeHtml(asset.sha256)}</code></figcaption></figure>`).join("");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Revisão Brand Cortex · ${escapeHtml(pilot.pilotId)}</title>
<style>body{font:14px system-ui;margin:0;background:#111827;color:#f9fafb}main{max-width:1200px;margin:auto;padding:24px}.meta,.card{background:#1f2937;border:1px solid #374151;border-radius:12px;padding:16px;margin-bottom:16px}.card{display:grid;grid-template-columns:minmax(280px,1fr) 1fr;gap:18px}.card img,.references img{width:100%;height:auto;border-radius:8px;background:#fff}.references{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.references figure{margin:0}.content{min-width:0}.criteria{display:grid;grid-template-columns:1fr 1fr;gap:8px}label{display:grid;gap:4px;margin-top:10px}select,input,textarea{font:inherit;padding:8px;border-radius:6px;border:1px solid #6b7280;background:#111827;color:#fff}textarea{min-height:72px}pre{white-space:pre-wrap;word-break:break-word;background:#111827;padding:10px;border-radius:6px}code{word-break:break-all;font-size:11px}button{padding:10px 14px;border:0;border-radius:8px;background:#f4b400;color:#111827;font-weight:700}@media(max-width:720px){.card{grid-template-columns:1fr}.criteria{grid-template-columns:1fr}}</style></head>
<body><main><h1>Revisão Brand Cortex</h1><section class="meta"><p>Piloto <strong>${escapeHtml(pilot.pilotId)}</strong> · Brand Knowledge v${pilot.brandKnowledge.versionNumber}</p><label>Reviewer ID<input id="reviewerId" autocomplete="off"></label></section>
<section class="meta"><h2>Diretrizes e evidências</h2><p><strong>Brand Kit:</strong> <code>${escapeHtml(JSON.stringify(pilot.brandKit))}</code></p><p><strong>Claims:</strong> <code>${escapeHtml(JSON.stringify(pilot.claims))}</code></p><div class="references">${references}</div></section>${cards}
<section class="meta"><label>Decisão final<select id="releaseDecision"><option value="">Selecione</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label><label>Justificativa<textarea id="releaseNotes"></textarea></label><button type="button" id="download">Baixar revisão JSON</button></section></main>
<script>const review=${embedded};document.getElementById("download").addEventListener("click",()=>{review.reviewerId=document.getElementById("reviewerId").value.trim();review.reviewedAt=new Date().toISOString();document.querySelectorAll("[data-artifact-id]").forEach((card,index)=>{const item=review.artifacts[index];item.verdict=card.querySelector('[data-field="verdict"]').value;item.notes=card.querySelector('[data-field="notes"]').value.trim()||null;card.querySelectorAll("[data-criterion]").forEach(select=>{item.criteria[select.dataset.criterion]=select.value})});review.releaseDecision.status=document.getElementById("releaseDecision").value;review.releaseDecision.notes=document.getElementById("releaseNotes").value.trim();const blob=new Blob([JSON.stringify(review,null,2)+"\\n"],{type:"application/json"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="brand-cortex-release-review.json";link.click();URL.revokeObjectURL(link.href)});</script></body></html>`;
}

export function evaluateBrandCortexPilotReview(input: {
  pilot: unknown;
  review: unknown;
}) {
  const pilot = brandCortexPilotManifestSchema.parse(input.pilot);
  const review = brandCortexReleaseReviewSchema.parse(input.review);
  const evidence = inspectBrandCortexPilot(pilot);
  const pilotSha256 = evidence.pilotSha256;
  const artifactsById = new Map(pilot.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  const failures: string[] = [];
  const pending: string[] = [];
  for (const format of evidence.coverage.requiredFormats) {
    const count = evidence.coverage.artifactsPerFormat[format] ?? 0;
    if (count < evidence.coverage.minimumArtifactsPerFormat) {
      pending.push(`${format}: requires ${evidence.coverage.minimumArtifactsPerFormat} real artifacts, found ${count}`);
    }
  }
  if (review.pilotId !== pilot.pilotId) failures.push("pilot id does not match the reviewed manifest");
  if (review.pilotSha256 !== pilotSha256) failures.push("pilot hash does not match the reviewed manifest");
  for (const artifact of pilot.artifacts) {
    if (createHash("sha256").update(artifact.prompt).digest("hex") !== artifact.promptSha256) {
      failures.push(`${artifact.artifactId}: frozen prompt hash does not match`);
    }
    if (artifact.provider.model.includes("e2e-controlled")) {
      failures.push(`${artifact.artifactId}: controlled provider cannot prove real visual quality`);
    }
    if (artifact.deterministicFidelity !== "proven") {
      failures.push(`${artifact.artifactId}: deterministic brand fidelity is ${artifact.deterministicFidelity}`);
    }
  }
  for (const item of review.artifacts) {
    const artifact = artifactsById.get(item.artifactId);
    if (!artifact) failures.push(`${item.artifactId}: artifact is not present in the reviewed manifest`);
    else if (item.artifactSha256 !== artifact.artifactSha256) {
      failures.push(`${item.artifactId}: artifact hash does not match the reviewed manifest`);
    }
    if (item.verdict === "fail") failures.push(`${item.artifactId}: human verdict is fail`);
    else if (item.verdict === "needs_changes") pending.push(`${item.artifactId}: human verdict needs changes`);
    for (const [criterion, verdict] of Object.entries(item.criteria)) {
      if (verdict === "fail") failures.push(`${item.artifactId}: ${criterion} is fail`);
      else if (verdict === "needs_changes") pending.push(`${item.artifactId}: ${criterion} needs changes`);
    }
  }
  failures.push(...evidence.typography.conflicts.map((conflict) => `typography: ${conflict}`));
  if (review.releaseDecision.status === "rejected") failures.push("human release decision is rejected");
  const reviewedIds = new Set(review.artifacts.map((item) => item.artifactId));
  for (const artifact of pilot.artifacts) {
    if (!reviewedIds.has(artifact.artifactId)) pending.push(`${artifact.artifactId}: human review is missing`);
  }
  const status = failures.length > 0
    ? "failed" as const
    : pending.length > 0
      ? "human_needed" as const
      : "approved" as const;
  return {
    schemaVersion: 1 as const,
    reportType: "brand-cortex-human-release" as const,
    status,
    pilotId: pilot.pilotId,
    pilotSha256,
    reviewSha256: hashBrandCortexEvidence(review),
    reviewerId: review.reviewerId,
    reviewedAt: review.reviewedAt,
    failures,
    pending,
    coverage: evidence.coverage,
    integrity: evidence.integrity,
    typography: evidence.typography,
  };
}

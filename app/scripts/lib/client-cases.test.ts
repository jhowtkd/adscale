import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CLIENT_CASE_SLUGS,
  clientCaseProfileName,
  loadClientCasesManifest,
  validateClientCasesManifest,
  assertClientAssetFiles,
  resolveClientCaptures,
  assertClientCaptureOutputPath,
  type ClientCasesManifest,
} from "./client-cases";

const sha = (content: string) => createHash("sha256").update(content).digest("hex");

function manifest(overrides?: Partial<ClientCasesManifest>): ClientCasesManifest {
  const base: ClientCasesManifest = {
    version: 1,
    environment: "development",
    studies: [
      {
        slug: "nike",
        brand: "Nike",
        focus: "Pegasus 41",
        profileName: "Nike — Pegasus 41",
        authorization: { authorizedBy: "cliente", commercialUse: true, scope: "uso comercial", documentRef: null },
        assets: [
          { id: "n1", fileName: "n1.jpg", sha256: sha("n1"), role: "campaign_reference", usageMode: "reference" },
          { id: "n2", fileName: "n2.jpg", sha256: sha("n2"), role: "product_reference", usageMode: "reference" },
        ],
        briefs: {
          primary: { theme: "Pegasus 41", objective: "Lancamento", audience: "", offer: null },
          fresh: { theme: "Pegasus 41 — outra cena", objective: "Sistema", audience: "", offer: null },
        },
      },
      {
        slug: "amazon",
        brand: "Amazon",
        focus: "Institucional",
        profileName: "Amazon",
        authorization: { authorizedBy: "cliente", commercialUse: true, scope: "uso comercial", documentRef: null },
        assets: [{ id: "a1", fileName: "a1.avif", sha256: sha("a1"), role: "brand_asset", usageMode: "reference" }],
        briefs: {
          primary: { theme: "Institucional", objective: "Marca", audience: "", offer: null },
          fresh: { theme: "Institucional — outra cena", objective: "Marca", audience: "", offer: null },
        },
      },
      {
        slug: "burger-king",
        brand: "Burger King",
        focus: "Rebrand",
        profileName: "Burger King",
        authorization: { authorizedBy: "cliente", commercialUse: true, scope: "uso comercial", documentRef: null },
        assets: [{ id: "b1", fileName: "b1.jpg", sha256: sha("b1"), role: "brand_asset", usageMode: "reference" }],
        briefs: {
          primary: { theme: "Rebrand", objective: "Sistema grafico", audience: "", offer: null },
          fresh: { theme: "Rebrand — outra cena", objective: "Sistema grafico", audience: "", offer: null },
        },
      },
    ],
    captures: [],
  };
  const stages = ["context", "training", "direction", "results", "decision"] as const;
  const mobile = new Set(["training", "results", "decision"]);
  const captures = [];
  for (const study of base.studies) {
    for (const stage of stages) {
      captures.push({
        id: `${study.slug}-${stage}-desktop`,
        brand: study.slug,
        stage,
        routeKey: stage === "context" || stage === "training" ? "brandTraining" : stage === "direction" ? "creativeWork" : "library",
        viewport: { width: 1440, height: 1000 },
        waitFor: "main",
        output: `${study.slug}-${stage}-1440.png`,
      });
      if (mobile.has(stage)) {
        captures.push({
          id: `${study.slug}-${stage}-mobile`,
          brand: study.slug,
          stage,
          routeKey: stage === "training" ? "brandTraining" : stage === "results" || stage === "decision" ? "library" : "creativeWork",
          viewport: { width: 390, height: 844 },
          waitFor: "main",
          output: `${study.slug}-${stage}-390.png`,
        });
      }
    }
  }
  return { ...base, ...overrides, captures };
}

describe("client cases contract", () => {
  it("names brand profiles without study markers", () => {
    expect(clientCaseProfileName("nike")).toBe("Nike — Pegasus 41");
    expect(clientCaseProfileName("amazon")).toBe("Amazon");
    expect(clientCaseProfileName("burger-king")).toBe("Burger King");
  });

  it("validates the full grid of 24 captures", () => {
    expect(() => validateClientCasesManifest(manifest())).not.toThrow();
  });

  it("rejects duplicate slugs and missing grid rows", () => {
    const dup = manifest();
    dup.studies[1].slug = "nike";
    expect(() => validateClientCasesManifest(dup)).toThrow(/duplicate/);
    const missing = manifest();
    missing.captures = missing.captures.filter((c) => !(c.brand === "amazon" && c.stage === "training" && c.viewport.width === 390));
    expect(() => validateClientCasesManifest(missing)).toThrow(/mobile training|expected 3 mobile/);
  });

  it("requires authorization blocks with commercial use", () => {
    const m = manifest();
    m.studies[0].authorization = { authorizedBy: "cliente", commercialUse: false, scope: "x", documentRef: null } as never;
    expect(() => clientCasesManifestSchema.parse(m)).toThrow();
  });

  it("hash-checks client asset files", () => {
    const dir = mkdtempSync(join(tmpdir(), "cc-assets-"));
    for (const slug of ["nike", "amazon", "burger-king"]) mkdirSync(join(dir, slug));
    writeFileSync(join(dir, "nike", "n1.jpg"), "n1");
    writeFileSync(join(dir, "nike", "n2.jpg"), "n2");
    writeFileSync(join(dir, "amazon", "a1.avif"), "a1");
    writeFileSync(join(dir, "burger-king", "b1.jpg"), "b1");
    expect(() => assertClientAssetFiles(manifest(), dir)).not.toThrow();
    const bad = manifest();
    bad.studies[0].assets[0].sha256 = sha("wrong");
    expect(() => assertClientAssetFiles(bad, dir)).toThrow(/hash mismatch/);
  });

  it("resolves routes and rejects path escapes", () => {
    const runtime = {
      sourceManifest: "manifest.json",
      generatedAt: "2026-08-29T00:00:00.000Z",
      account: { email: "estudos@example.test", userId: "u", workspaceId: "w" },
      studies: {
        nike: { clientProfileId: "p1", creativeWorkId: "w1", trainingReferenceIds: [], assetKeys: [], selectedRealOutputIds: [], routes: { brandTraining: "/brand-kit", creativeWork: "/creative-work/w1", library: "/library" }, controlledUi: { generating: "g", failed: "f", empty: "e" } },
        amazon: { clientProfileId: "p2", creativeWorkId: "w2", trainingReferenceIds: [], assetKeys: [], selectedRealOutputIds: [], routes: { brandTraining: "/brand-kit", creativeWork: "/creative-work/w2", library: "/library" }, controlledUi: { generating: "g", failed: "f", empty: "e" } },
        "burger-king": { clientProfileId: "p3", creativeWorkId: "w3", trainingReferenceIds: [], assetKeys: [], selectedRealOutputIds: [], routes: { brandTraining: "/brand-kit", creativeWork: "/creative-work/w3", library: "/library" }, controlledUi: { generating: "g", failed: "f", empty: "e" } },
      },
    } as never;
    const resolved = resolveClientCaptures(manifest(), runtime);
    expect(resolved).toHaveLength(24);
    expect(resolved.filter((c) => c.brand === "nike" && c.stage === "direction")[0].route).toBe("/creative-work/w1");
    expect(() => assertClientCaptureOutputPath("../x.png", "/tmp/shots")).toThrow();
  });
});

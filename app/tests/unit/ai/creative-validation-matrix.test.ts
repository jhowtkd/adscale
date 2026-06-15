import { describe, it, expect } from "vitest";
import { CANONICAL_CAMPAIGNS } from "@/server/ai/creative-corpus";
import {
  CREATIVE_VALIDATION_MATRIX,
  CREATIVE_VALIDATION_SEED_SUPPORTED,
  matrixKeys,
  matrixRowByKey,
  modesInMatrix,
} from "../../../scripts/creative-validation-matrix";

const KEY_PATTERN =
  /^[\w-]+:(art_variation|restyling|format_adaptation):[\d:.]+$/;

describe("QA-18 creative validation matrix regression", () => {
  it("anchors corpus refs used by downstream evidence capture scripts", () => {
    const byRef = Object.fromEntries(
      CREATIVE_VALIDATION_MATRIX.map((row) => [row.beforeCorpusRefId, row])
    );
    expect(byRef["27069645"]?.auditArchetype).toBe("invented_factual_entity");
    expect(byRef["d7d9d323"]?.auditArchetype).toBe(
      "restyling_factual_contamination"
    );
    expect(byRef["c2c12774"]?.format).toBe("4:5");
  });
});

describe("CREATIVE_VALIDATION_MATRIX", () => {
  it("exports exactly six rows with unique keys", () => {
    expect(CREATIVE_VALIDATION_MATRIX).toHaveLength(6);
    const keys = matrixKeys();
    expect(new Set(keys).size).toBe(6);
    for (const key of keys) {
      expect(key).toMatch(KEY_PATTERN);
    }
  });

  it("maps every canonicalSlug to CANONICAL_CAMPAIGNS", () => {
    for (const row of CREATIVE_VALIDATION_MATRIX) {
      expect(CANONICAL_CAMPAIGNS[row.canonicalSlug]).toBeDefined();
    }
  });

  it("includes styleAsset only on restyling rows", () => {
    for (const row of CREATIVE_VALIDATION_MATRIX) {
      if (row.mode === "restyling") {
        expect(row.styleAsset).toBeTruthy();
      } else {
        expect(row.styleAsset).toBeUndefined();
      }
    }
  });

  it("documents creativeLevel, baseAsset, and beforeCorpusRefId on every row", () => {
    for (const row of CREATIVE_VALIDATION_MATRIX) {
      expect(row.creativeLevel).toBe("balanced");
      expect(row.baseAsset).toMatch(/\.png$/);
      expect(row.beforeCorpusRefId).toHaveLength(8);
    }
  });

  it("exports CREATIVE_VALIDATION_SEED_SUPPORTED as false", () => {
    expect(CREATIVE_VALIDATION_SEED_SUPPORTED).toBe(false);
  });

  it("covers all three derivation modes", () => {
    const modes = modesInMatrix();
    expect(modes.has("art_variation")).toBe(true);
    expect(modes.has("restyling")).toBe(true);
    expect(modes.has("format_adaptation")).toBe(true);
    expect(modes.size).toBe(3);
  });

  it("includes format_adaptation for 9:16 and 4:5", () => {
    const formatAdaptation = CREATIVE_VALIDATION_MATRIX.filter(
      (row) => row.mode === "format_adaptation"
    );
    const formats = formatAdaptation.map((row) => row.format);
    expect(formats).toContain("9:16");
    expect(formats).toContain("4:5");
  });

  it("anchors QA-20 failure archetypes 27069645 and d7d9d323", () => {
    const refIds = CREATIVE_VALIDATION_MATRIX.map((row) => row.beforeCorpusRefId);
    expect(refIds).toContain("27069645");
    expect(refIds).toContain("d7d9d323");
  });

  it("anchors faithful positive c2c12774 for format_adaptation", () => {
    const faithful = CREATIVE_VALIDATION_MATRIX.find(
      (row) => row.beforeCorpusRefId === "c2c12774"
    );
    expect(faithful).toBeDefined();
    expect(faithful?.mode).toBe("format_adaptation");
    expect(faithful?.format).toBe("4:5");
  });

  it("covers 1:1, 4:5, and 9:16 formats", () => {
    const formats = new Set(CREATIVE_VALIDATION_MATRIX.map((row) => row.format));
    expect(formats.has("1:1")).toBe(true);
    expect(formats.has("4:5")).toBe(true);
    expect(formats.has("9:16")).toBe(true);
  });

  it("resolves matrixRowByKey for each matrix key", () => {
    for (const key of matrixKeys()) {
      expect(matrixRowByKey(key)?.key).toBe(key);
    }
    expect(matrixRowByKey("missing:key:1:1")).toBeUndefined();
  });
});

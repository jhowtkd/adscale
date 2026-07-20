import { describe, expect, it } from "vitest";
import {
  importedKeyFor,
  parseImportArgs,
  requiredEnvironment,
} from "./import-curated-inspirations";

describe("import-curated-inspirations", () => {
  it("uses a deterministic target key", () => {
    expect(importedKeyFor(
      "7c0e1b42-2d72-4cec-8aa9-86e55504ce75",
      "Editorial 01.jpg",
    )).toBe(
      "curated-inspirations/imported-7c0e1b42-2d72-4cec-8aa9-86e55504ce75-Editorial_01.jpg",
    );
  });

  it("recognizes dry-run without performing writes", () => {
    expect(parseImportArgs(["--dry-run"])).toEqual({ dryRun: true });
    expect(parseImportArgs([])).toEqual({ dryRun: false });
  });

  it("reports the exact missing environment variable", () => {
    expect(() => requiredEnvironment({}, "SOURCE_DATABASE_URL"))
      .toThrow("SOURCE_DATABASE_URL is required");
  });
});

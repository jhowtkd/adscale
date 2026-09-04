import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { studioBentoClass } from "@/components/dashboard/studio-stage/StudioInstrument";

const shareFiles = [
  "src/app/share/[token]/page.tsx",
  "src/app/share/[token]/GalleryGrid.tsx",
];

describe("share chrome", () => {
  it("keeps share on the Biblioteca mosaic language", () => {
    expect(studioBentoClass).toContain("columns-2");
  });

  it("does not use Palco ivory fill or nested gallery cards", () => {
    const root = process.cwd();
    for (const file of shareFiles) {
      const source = readFileSync(path.join(root, file), "utf8");
      expect(source, file).not.toContain("action-primary-bg");
      expect(source, file).not.toContain("shadow-[0_12px");
      expect(source, file).not.toContain("recipientGuideTitle");
    }
  });
});

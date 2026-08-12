import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { runSquareTextComposition } from "./text-composite";

describe("runSquareTextComposition", () => {
  it("renders approved copy reproducibly and records the literal inputs", async () => {
    const base = await sharp({
      create: {
        width: 1080,
        height: 1080,
        channels: 3,
        background: { r: 238, g: 220, b: 190 },
      },
    }).png().toBuffer();
    const font = await readFile(join(
      process.cwd(),
      "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
    ));
    const originalFont = Buffer.from(font);
    const input = {
      base,
      dimensions: { width: 1080, height: 1080 } as const,
      copy: {
        headline: "Oferta <literal>",
        body: "Condição & benefício sem invenção.",
        cta: "Saiba mais",
      },
      font: {
        assetKey: "workspaces/ws-1/brand-fonts/geist.ttf",
        family: "Geist",
        source: "Licença do projeto",
        weight: 400 as const,
        style: "normal" as const,
        sha256: createHash("sha256").update(font).digest("hex"),
        approvedAt: "2026-08-12T12:00:00.000Z",
        approvedByUserId: "user-1",
      },
      fontBuffer: font,
    };

    const first = await runSquareTextComposition(input);
    const second = await runSquareTextComposition(input);

    expect(first.buffer.equals(second.buffer)).toBe(true);
    expect(first.provenance).toMatchObject({
      version: 1,
      execution: "deterministic",
      format: "1:1",
      font: {
        assetKey: input.font.assetKey,
        sha256: input.font.sha256,
      },
      copy: input.copy,
      layers: [
        { role: "headline", box: expect.objectContaining({ width: expect.any(Number) }) },
        { role: "body", box: expect.objectContaining({ width: expect.any(Number) }) },
        { role: "cta", box: expect.objectContaining({ width: expect.any(Number) }) },
      ],
      planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first.provenance.outputHash).toBe(second.provenance.outputHash);
    expect(font.equals(originalFont)).toBe(true);
    expect(await sharp(first.buffer).metadata()).toMatchObject({
      width: 1080,
      height: 1080,
      format: "png",
    });
  });
});

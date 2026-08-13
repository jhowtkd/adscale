import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { normalizeBrandFontUpload } from "./font-assets";

function validTtf(): Buffer {
  const tags = ["head", "maxp", "name", "cmap"];
  const directoryEnd = 12 + tags.length * 16;
  const buffer = Buffer.alloc(directoryEnd + tags.length * 4);
  buffer.writeUInt32BE(0x00010000, 0);
  buffer.writeUInt16BE(tags.length, 4);
  tags.forEach((tag, index) => {
    const entry = 12 + index * 16;
    tag.split("").forEach((char, offset) => buffer.writeUInt8(char.charCodeAt(0), entry + offset));
    buffer.writeUInt32BE(directoryEnd + index * 4, entry + 8);
    buffer.writeUInt32BE(4, entry + 12);
  });
  return buffer;
}

describe("brand font uploads", () => {
  it("accepts a structurally valid TTF and records its content hash", async () => {
    const buffer = validTtf();
    const file = new File([buffer], "brand.ttf", { type: "font/ttf" });

    await expect(normalizeBrandFontUpload(file)).resolves.toEqual({
      buffer,
      mimeType: "font/ttf",
      extension: "ttf",
      sha256: createHash("sha256").update(buffer).digest("hex"),
    });
  });

  it("rejects a spoofed or truncated font", async () => {
    const file = new File([Buffer.from("not-a-font")], "brand.ttf", { type: "font/ttf" });

    await expect(normalizeBrandFontUpload(file)).rejects.toThrow("invalid_font");
  });
});

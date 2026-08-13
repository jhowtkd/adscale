import { createHash } from "node:crypto";

const MAX_BRAND_FONT_BYTES = 10 * 1024 * 1024;
const REQUIRED_TABLES = ["head", "maxp", "name", "cmap"] as const;

export interface BrandFontAsset {
  assetKey: string;
  family: string;
  source: string;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  style: "normal" | "italic";
  sha256: string;
  approvedAt: string;
  approvedByUserId: string;
}

export type BrandFontReviewStatus = "pending_approval" | "approved" | "archived";

export interface BrandFontAssetRecord extends Omit<BrandFontAsset, "approvedAt" | "approvedByUserId"> {
  reviewStatus: BrandFontReviewStatus;
  uploadedAt: string;
  uploadedByUserId: string;
  approvedAt: string | null;
  approvedByUserId: string | null;
  archivedAt?: string | null;
  archivedByUserId?: string | null;
}

export type StoredBrandFontAsset = BrandFontAsset | BrandFontAssetRecord;

/** Legacy entries predate reviewStatus and remain approved for backwards compatibility. */
export function approvedBrandFontAssets(
  fonts: readonly StoredBrandFontAsset[],
): BrandFontAsset[] {
  return fonts.filter((font): font is BrandFontAsset => (
    !("reviewStatus" in font)
    || (font.reviewStatus === "approved" && Boolean(font.approvedAt && font.approvedByUserId))
  ));
}

function readTag(buffer: Buffer, offset: number): string {
  return buffer.toString("ascii", offset, offset + 4);
}

function assertSfntStructure(buffer: Buffer, kind: "ttf" | "otf"): void {
  if (buffer.length < 28) throw new Error("invalid_font");
  const signature = buffer.subarray(0, 4);
  const isTtf = signature.equals(Buffer.from([0x00, 0x01, 0x00, 0x00]));
  const isOtf = signature.toString("ascii") === "OTTO";
  if ((kind === "ttf" && !isTtf) || (kind === "otf" && !isOtf)) {
    throw new Error("invalid_font");
  }

  const tableCount = buffer.readUInt16BE(4);
  const directoryEnd = 12 + tableCount * 16;
  if (tableCount === 0 || tableCount > 64 || directoryEnd > buffer.length) {
    throw new Error("invalid_font");
  }

  const tags = new Set<string>();
  for (let index = 0; index < tableCount; index += 1) {
    const entry = 12 + index * 16;
    const tag = readTag(buffer, entry);
    const offset = buffer.readUInt32BE(entry + 8);
    const length = buffer.readUInt32BE(entry + 12);
    if (tags.has(tag) || length === 0 || offset < directoryEnd || offset + length > buffer.length) {
      throw new Error("invalid_font");
    }
    tags.add(tag);
  }

  if (REQUIRED_TABLES.some((tag) => !tags.has(tag))) throw new Error("invalid_font");
  if (kind === "otf" && !tags.has("CFF ") && !tags.has("CFF2")) {
    throw new Error("invalid_font");
  }
}

export async function normalizeBrandFontUpload(file: File): Promise<{
  buffer: Buffer;
  mimeType: "font/ttf" | "font/otf";
  extension: "ttf" | "otf";
  sha256: string;
}> {
  if (file.size <= 0 || file.size > MAX_BRAND_FONT_BYTES) throw new Error("invalid_size");
  const extension = file.name.toLowerCase().endsWith(".otf") ? "otf" : file.name.toLowerCase().endsWith(".ttf") ? "ttf" : null;
  if (!extension) throw new Error("invalid_type");
  const allowedTypes = extension === "ttf"
    ? new Set(["font/ttf", "application/x-font-ttf", "application/octet-stream"])
    : new Set(["font/otf", "application/x-font-opentype", "application/octet-stream"]);
  if (!allowedTypes.has(file.type)) throw new Error("invalid_type");

  const buffer = Buffer.from(await file.arrayBuffer());
  assertSfntStructure(buffer, extension);
  return {
    buffer,
    mimeType: extension === "ttf" ? "font/ttf" : "font/otf",
    extension,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

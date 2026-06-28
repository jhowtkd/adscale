import JSZip from "jszip";
import pLimit from "p-limit";
import "server-only";
import { logger } from "@/lib/logger";
import sharp from "sharp";
import { ObjectStorage } from "../storage/object-storage";
import {
  getDerivationById,
  getApprovedDerivationsByCampaign,
} from "../repositories/derivation";
import { getCampaignById } from "../repositories/campaign";
import { createExportRecord } from "../repositories/export";

async function convertImage(buffer: Buffer, format: "png" | "jpeg" | "webp") {
  try {
    const converter = sharp(buffer);
    if (format === "png") return await converter.png().toBuffer();
    if (format === "jpeg") return await converter.jpeg().toBuffer();
    if (format === "webp") return await converter.webp().toBuffer();
    return buffer;
  } catch {
    throw new Error(`Failed to convert image to ${format}: invalid or corrupted image buffer`);
  }
}

function getContentType(format: "png" | "jpeg" | "webp") {
  const map: Record<string, string> = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[format];
}

export async function exportIndividual(
  storage: ObjectStorage,
  derivationId: string,
  workspaceId: string,
  format: "png" | "jpeg" | "webp"
) {
  const derivation = await getDerivationById(derivationId, workspaceId);
  if (!derivation) {
    throw new Error("Derivation not found");
  }
  if (!derivation.outputKey) {
    throw new Error("Derivation has no output file");
  }

  const storedFormat = derivation.format?.toLowerCase() as
    | "png"
    | "jpeg"
    | "webp"
    | undefined;

  if (storedFormat === format) {
    const [url] = await Promise.all([
      storage.signedDownloadUrl(derivation.outputKey),
      createExportRecord(workspaceId, derivationId, format, derivation.outputKey),
    ]);
    return { url, key: derivation.outputKey };
  }

  const buffer = await storage.get(derivation.outputKey);
  const converted = await convertImage(buffer, format);
  const newKey = `exports/${workspaceId}/${derivationId}/${Date.now()}.${format}`;
  await storage.put(newKey, converted, getContentType(format));
  const [url] = await Promise.all([
    storage.signedDownloadUrl(newKey),
    createExportRecord(workspaceId, derivationId, format, newKey),
  ]);
  return { url, key: newKey };
}

export async function exportAllApproved(
  storage: ObjectStorage,
  campaignId: string,
  workspaceId: string,
  format: "png" | "jpeg" | "webp"
) {
  const [campaign, items] = await Promise.all([
    getCampaignById(campaignId, workspaceId),
    getApprovedDerivationsByCampaign(campaignId, workspaceId),
  ]);
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  if (items.length === 0) {
    throw new Error("No approved derivations");
  }

  const zip = new JSZip();
  const folder = zip.folder("derivations") || zip;
  let addedFiles = 0;

  const limit = pLimit(4);
  const results = await Promise.all(
    items.map((d) =>
      limit(async () => {
        if (!d.outputKey) {
          logger.warn(`[exportAllApproved] skipping derivation without outputKey id=${d.id}`);
          return null;
        }
        try {
          const buffer = await storage.get(d.outputKey);
          const storedFormat = d.format?.toLowerCase() as
            | "png"
            | "jpeg"
            | "webp"
            | undefined;
          const finalBuffer =
            storedFormat === format ? buffer : await convertImage(buffer, format);
          return { d, finalBuffer };
        } catch (error) {
          logger.error(`[exportAllApproved] failed to add derivation id=${d.id} key=${d.outputKey}`, error);
          return null;
        }
      })
    )
  );

  for (const result of results) {
    if (!result) continue;
    const { finalBuffer } = result;
    const safeName = campaign.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const fileName = `${safeName}-${addedFiles + 1}.${format}`;
    folder.file(fileName, finalBuffer);
    addedFiles++;
  }

  if (addedFiles === 0) {
    throw new Error("No exportable approved derivations");
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const zipKey = `exports/${workspaceId}/${campaignId}/${Date.now()}-all.zip`;
  await storage.put(zipKey, zipBuffer, "application/zip");

  const [url] = await Promise.all([
    storage.signedDownloadUrl(zipKey),
    Promise.all(items.map((d) => createExportRecord(workspaceId, d.id, format, zipKey))),
  ]);
  return { url, key: zipKey };
}

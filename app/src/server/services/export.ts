import JSZip from "jszip";
import sharp from "sharp";
import {
  getPresignedDownloadUrl,
  uploadBuffer,
  downloadBuffer,
} from "../storage/r2";
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
    const url = await getPresignedDownloadUrl(derivation.outputKey);
    await createExportRecord(workspaceId, derivationId, format, derivation.outputKey);
    return { url, key: derivation.outputKey };
  }

  const buffer = await downloadBuffer(derivation.outputKey);
  const converted = await convertImage(buffer, format);
  const newKey = `exports/${workspaceId}/${derivationId}/${Date.now()}.${format}`;
  await uploadBuffer(newKey, converted, getContentType(format));
  await createExportRecord(workspaceId, derivationId, format, newKey);
  const url = await getPresignedDownloadUrl(newKey);
  return { url, key: newKey };
}

export async function exportAllApproved(
  campaignId: string,
  workspaceId: string,
  format: "png" | "jpeg" | "webp"
) {
  const campaign = await getCampaignById(campaignId, workspaceId);
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const items = await getApprovedDerivationsByCampaign(campaignId, workspaceId);
  if (items.length === 0) {
    throw new Error("No approved derivations");
  }

  const zip = new JSZip();
  const folder = zip.folder("derivations") || zip;
  let addedFiles = 0;

  for (let i = 0; i < items.length; i++) {
    const d = items[i];
    if (!d.outputKey) {
      console.warn(`[exportAllApproved] skipping derivation without outputKey id=${d.id}`);
      continue;
    }

    try {
      const buffer = await downloadBuffer(d.outputKey);
      const storedFormat = d.format?.toLowerCase() as
        | "png"
        | "jpeg"
        | "webp"
        | undefined;
      const finalBuffer =
        storedFormat === format ? buffer : await convertImage(buffer, format);

      const safeName = campaign.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      const fileName = `${safeName}-${addedFiles + 1}.${format}`;
      folder.file(fileName, finalBuffer);
      addedFiles++;
    } catch (error) {
      console.error(`[exportAllApproved] failed to add derivation id=${d.id} key=${d.outputKey}`, error);
    }
  }

  if (addedFiles === 0) {
    throw new Error("No exportable approved derivations");
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const zipKey = `exports/${workspaceId}/${campaignId}/${Date.now()}-all.zip`;
  await uploadBuffer(zipKey, zipBuffer, "application/zip");

  for (const d of items) {
    await createExportRecord(workspaceId, d.id, format, zipKey);
  }

  const url = await getPresignedDownloadUrl(zipKey);
  return { url, key: zipKey };
}

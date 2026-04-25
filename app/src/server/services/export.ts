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
  const converter = sharp(buffer);
  if (format === "png") return converter.png().toBuffer();
  if (format === "jpeg") return converter.jpeg().toBuffer();
  if (format === "webp") return converter.webp().toBuffer();
  return buffer;
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

  for (let i = 0; i < items.length; i++) {
    const d = items[i];
    if (!d.outputKey) continue;

    const buffer = await downloadBuffer(d.outputKey);
    const storedFormat = d.format?.toLowerCase() as
      | "png"
      | "jpeg"
      | "webp"
      | undefined;
    const finalBuffer =
      storedFormat === format ? buffer : await convertImage(buffer, format);

    const safeName = campaign.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const fileName = `${safeName}-${i + 1}.${format}`;
    folder.file(fileName, finalBuffer);
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

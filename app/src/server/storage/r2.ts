import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { env } from "../validation/env";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  contentLength: number
) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(r2, command, { expiresIn: 300 });
}

export async function getPresignedDownloadUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn: 300 });
}

export async function deleteObject(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });
  await r2.send(command);
}

export function getPublicUrl(key: string) {
  return `${env.R2_PUBLIC_BASE_URL}/${key}`;
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await r2.send(command);
  return key;
}

export async function headObject(key: string) {
  try {
    const command = new HeadObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
    });
    return await r2.send(command);
  } catch {
    return null;
  }
}

export async function downloadBuffer(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: key,
  });
  const response = await r2.send(command);
  if (!response.Body) {
    throw new Error("Empty response body");
  }

  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

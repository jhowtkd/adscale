import { NextResponse } from "next/server";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";
import {
  normalizeE2EStorageObjectKey,
  type E2EStorageUrlKind,
} from "@/server/storage/local-directory-object-storage";
import { objectStorage } from "@/server/storage";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

function objectKey(parts: string[]): string | null {
  try {
    return normalizeE2EStorageObjectKey(parts.join("/")).join("/");
  } catch {
    return null;
  }
}

function asKind(value: string): E2EStorageUrlKind | null {
  if (value === "upload" || value === "download" || value === "public") return value;
  return null;
}

/**
 * Localhost E2E analogue of an R2 presigned URL. 404 unless the controlled
 * provider seam is on (loopback APP_URL + flag). Never enable that flag on Render.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; key: string[] }> },
) {
  if (!isE2EControlledProviderEnabled()) return notFound();

  const { kind: rawKind, key: keyParts } = await params;
  const kind = asKind(rawKind);
  const key = objectKey(keyParts);
  if (!key || (kind !== "download" && kind !== "public")) return notFound();

  try {
    const [data, meta] = await Promise.all([objectStorage.get(key), objectStorage.head(key)]);
    return new NextResponse(data, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": meta?.contentType ?? "application/octet-stream",
        "Content-Length": String(data.length),
      },
    });
  } catch {
    return notFound();
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ kind: string; key: string[] }> },
) {
  if (!isE2EControlledProviderEnabled()) return notFound();

  const { kind: rawKind, key: keyParts } = await params;
  const kind = asKind(rawKind);
  const key = objectKey(keyParts);
  if (!key || kind !== "upload") return notFound();

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      return new NextResponse(null, { status: 400 });
    }
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length <= 0 || buffer.length > MAX_UPLOAD_BYTES) {
    return new NextResponse(null, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  await objectStorage.put(key, buffer, contentType.split(";")[0]?.trim() || "application/octet-stream");
  return new NextResponse(null, { status: 204 });
}

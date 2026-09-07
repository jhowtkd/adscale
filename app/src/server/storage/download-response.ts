import { NextResponse } from "next/server";
import { objectStorage } from "@/server/storage";

/**
 * R2 presigned URLs stay a 302. The localhost E2E store uses `e2e-storage://`,
 * which production CSP `img-src` rejects and then blocks axe injection.
 * Stream those bytes on the existing authenticated download routes instead of
 * adding a new API tree.
 */
export async function objectDownloadResponse(url: string, key: string): Promise<NextResponse> {
  if (!url.startsWith("e2e-storage://")) {
    return NextResponse.redirect(url, { status: 302 });
  }

  const [data, meta] = await Promise.all([objectStorage.get(key), objectStorage.head(key)]);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": meta?.contentType ?? "application/octet-stream",
      "Content-Length": String(data.length),
    },
  });
}

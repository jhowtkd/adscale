import { NextResponse } from "next/server";
import { apiError, handleApiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { getCreativeWork } from "@/server/repositories/creative-work";
import { objectStorage } from "@/server/storage";

/**
 * Return a short-lived signed download URL for a completed output. Scoped by
 * workspace + work item + output ID so a foreign workspace can never obtain a
 * URL for someone else's output.
 *
 * Default behaviour is a 302 redirect to the signed URL — the wizard's
 * `<img src>` and the "Baixar" button both consume the endpoint directly
 * and expect a binary stream, not a JSON envelope. Programmatic callers
 * that want the JSON contract can opt in with `?format=json` or by
 * sending `Accept: application/json`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; outputId: string }> }
) {
  try {
    const [{ workspace }, { id, outputId }] = await Promise.all([
      requireWorkspaceAccess(request),
      params,
    ]);

    const existing = await getCreativeWork(workspace.id, id);
    if (!existing) {
      return apiError("creativeWorkNotFound", 404);
    }

    const output = existing.outputs.find((o) => o.id === outputId);
    if (!output) {
      return apiError("creativeWorkOutputNotFound", 404);
    }

    if (output.status !== "completed" || !output.outputKey) {
      return apiError("creativeWorkOutputNotReady", 409, {
        status: output.status,
      });
    }

    const url = await objectStorage.signedDownloadUrl(output.outputKey);

    // Branch on the request contract. Browsers navigating the URL
    // directly (preview + download) get the 302 redirect; programmatic
    // callers asking for JSON keep the original envelope.
    const url2 = new URL(request.url);
    const wantsJson =
      url2.searchParams.get("format") === "json" ||
      request.headers.get("accept")?.includes("application/json");
    if (wantsJson) {
      return NextResponse.json({ url });
    }
    return NextResponse.redirect(url, { status: 302 });
  } catch (error) {
    return handleApiError(error, "creative-work.[id].outputs.[outputId].download.GET");
  }
}
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { getCorpusIngestionStatus } from "@/server/human-quality/ingestion/status";

export async function GET(request: Request) {
  try {
    const { user } = await requirePlatformOwner(request);
    void user;
    const status = await getCorpusIngestionStatus();
    return NextResponse.json(status);
  } catch (error) {
    return handleApiError(error, "admin.quality.ingestion.status.GET");
  }
}

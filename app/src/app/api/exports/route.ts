import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { exportIndividual, exportAllApproved } from "@/server/services/export";

const bodySchema = z.object({
  type: z.enum(["individual", "batch"]),
  derivationId: z.string().optional(),
  campaignId: z.string().optional(),
  format: z.enum(["png", "jpeg", "webp"]),
});

export async function POST(request: Request) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { type, derivationId, campaignId, format } = parsed.data;
    const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();

    if (type === "individual") {
      if (!derivationId) {
        return NextResponse.json(
          { error: "derivationId required" },
          { status: 400 }
        );
      }
      const { url } = await exportIndividual(derivationId, workspace.id, format);
      return NextResponse.json({ downloadUrl: url, expiresAt });
    }

    if (type === "batch") {
      if (!campaignId) {
        return NextResponse.json(
          { error: "campaignId required" },
          { status: 400 }
        );
      }
      const { url } = await exportAllApproved(campaignId, workspace.id, format);
      return NextResponse.json({ downloadUrl: url, expiresAt });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "No workspace") {
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
    }
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

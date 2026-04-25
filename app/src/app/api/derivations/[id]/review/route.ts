import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { updateDerivationStatus } from "@/server/repositories/derivation";

const bodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { workspace } = await requireWorkspaceAccess(request);
    const { id } = await params;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const updated = await updateDerivationStatus(
      id,
      workspace.id,
      parsed.data.status
    );
    if (!updated) {
      return NextResponse.json(
        { error: "Derivation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ derivation: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "No workspace") {
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

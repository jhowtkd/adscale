import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-response";
import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { revokeTesterEntitlement } from "@/server/repositories/entitlements";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    await requirePlatformOwner(request);
    const { workspaceId } = await params;

    const revoked = await revokeTesterEntitlement(workspaceId);
    if (!revoked) {
      return NextResponse.json({ error: "Tester profile not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "admin.testers.DELETE");
  }
}

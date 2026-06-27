import { apiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

export async function POST(request: Request) {
  await requireWorkspaceAccess(request);
  return apiError("guidedFlowCommandsRequired", 409, {
    message: "Use progressive briefing and set_references through the guided-flow commands endpoint",
  });
}

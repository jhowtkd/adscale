import { apiError } from "@/lib/api-response";
import { requireWorkspaceAccess } from "@/server/auth/workspace";

async function commandsRequired(request: Request) {
  await requireWorkspaceAccess(request);
  return apiError("guidedFlowCommandsRequired", 409, {
    message: "Use select_creative or approve_diagnosis through the guided-flow commands endpoint",
  });
}

export async function POST(request: Request) {
  return commandsRequired(request);
}

export async function PATCH(request: Request) {
  return commandsRequired(request);
}

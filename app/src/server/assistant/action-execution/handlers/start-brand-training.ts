import { getActionContract } from "@/server/assistant/action-contracts/registry";
import {
  BrandKitAmbiguityError,
  BrandKitProfileNotFoundError,
  resolveBrandKitProfileId,
} from "@/server/db/repositories/brand-kit";
import type { ActionExecutionContext, ActionExecutionResult } from "../types";
import { AssistantActionExecutionError } from "../types";

/**
 * Start the brand training wizard from the assistant.
 *
 * The wizard is the primary surface (the chat only triggers and observes).
 * This handler resolves which profile to train, then returns a route the
 * client navigates to. When no profile is supplied, the handler tries to
 * resolve the workspace's sole profile; on ambiguity or absence it opens the
 * wizard on the profile-selection step instead of failing.
 */
export async function executeStartBrandTraining(
  ctx: ActionExecutionContext,
): Promise<ActionExecutionResult> {
  const contract = getActionContract("start_brand_training");
  const parsed = contract?.inputSchema.safeParse(ctx.inputSnapshot);
  if (!parsed?.success) {
    throw new AssistantActionExecutionError(
      "Invalid start_brand_training inputs",
      "execution_failed",
    );
  }

  // Prefer an explicit id: first from the action input, then from the thread's
  // bound client profile. Only consult the workspace resolver as a last resort
  // (sole-profile auto-resolution). Treat blank strings as absent.
  const inputId = typeof parsed.data.clientProfileId === "string"
    ? parsed.data.clientProfileId.trim()
    : "";
  const threadId = ctx.clientProfileId?.trim() ?? "";

  let resolvedProfileId: string | null = inputId || threadId || null;
  let summary: string;

  if (resolvedProfileId) {
    summary = "Treinamento de marca iniciado.";
  } else {
    try {
      resolvedProfileId = await resolveBrandKitProfileId(ctx.workspaceId, null);
      summary = "Treinamento de marca iniciado.";
    } catch (error) {
      if (error instanceof BrandKitProfileNotFoundError) {
        // No profile yet — open the wizard on profile creation/selection.
        resolvedProfileId = null;
        summary =
          "Nenhum perfil de marca encontrado. Abra o treinamento para criar o primeiro perfil.";
      } else if (error instanceof BrandKitAmbiguityError) {
        // Multiple profiles — let the user pick which one to train.
        resolvedProfileId = null;
        summary =
          "Há mais de um perfil de marca neste workspace. Abra o treinamento e escolha qual treinar.";
      } else {
        throw error;
      }
    }
  }

  const route = resolvedProfileId
    ? `/settings?tab=brandTraining&clientProfileId=${encodeURIComponent(resolvedProfileId)}`
    : `/settings?tab=brandTraining`;

  return {
    mode: "sync",
    route,
    resultSummary: `${summary} Continue o treinamento no painel de marca.`,
  };
}

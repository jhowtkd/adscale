import { z } from "zod";
import { getClientProfile } from "@/server/repositories/client-reference";

const scopeSchema = z.object({
  workspaceId: z.string().uuid(),
  clientProfileId: z.string().uuid(),
});

export interface LocalLearningScope {
  workspaceId: string;
  clientProfileId: string | null;
}

export type LocalLearningDenialReason =
  | "missing_brand"
  | "brand_out_of_scope"
  | "local_learning_denied";

export type LocalLearningAuthorization =
  | { allowed: true }
  | { allowed: false; reason: LocalLearningDenialReason };

export type LocalLearningAuthorizationPort = (
  scope: LocalLearningScope
) => Promise<LocalLearningAuthorization>;

export const authorizeLocalLearning: LocalLearningAuthorizationPort = async (scope) => {
  if (!scope.clientProfileId?.trim()) {
    return { allowed: false, reason: "missing_brand" };
  }
  if (!scopeSchema.safeParse(scope).success) {
    return { allowed: false, reason: "brand_out_of_scope" };
  }
  const brand = await getClientProfile(scope.workspaceId, scope.clientProfileId);
  return brand
    ? { allowed: true }
    : { allowed: false, reason: "brand_out_of_scope" };
};

export class LocalLearningAuthorizationError extends Error {
  constructor(public readonly reason: LocalLearningDenialReason) {
    super("Aprendizado local da marca não autorizado.");
    this.name = "LocalLearningAuthorizationError";
  }
}

export async function requireLocalLearningAuthorization(
  scope: LocalLearningScope,
  authorize: LocalLearningAuthorizationPort = authorizeLocalLearning
): Promise<void> {
  const result = await authorize(scope);
  if (!result.allowed) {
    throw new LocalLearningAuthorizationError(result.reason);
  }
}

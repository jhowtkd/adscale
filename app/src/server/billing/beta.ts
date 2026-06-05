import { db } from "@/server/db";
import { createCreditGrant } from "@/server/repositories/billing";
import {
  createBetaEntitlement,
  getActiveBetaEntitlementByWorkspace,
  getBetaRedemptionByWorkspace,
  recordBetaRedemption,
} from "@/server/repositories/entitlements";

import {
  BETA_CREDIT_GRANT_AMOUNT,
  BETA_CREDIT_GRANT_SOURCE,
} from "./entitlements";

export type BetaRedeemErrorCode =
  | "invalid_code"
  | "already_redeemed"
  | "beta_unavailable";

export class BetaRedeemError extends Error {
  constructor(
    readonly code: BetaRedeemErrorCode,
    message: string
  ) {
    super(message);
    this.name = "BetaRedeemError";
  }
}

function normalizeBetaCode(code: string) {
  return code.trim().toUpperCase();
}

export function getConfiguredBetaCodes() {
  const raw = process.env.BETA_ACCESS_CODES?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => normalizeBetaCode(entry))
    .filter(Boolean);
}

export function isBetaCodeValid(code: string) {
  const normalized = normalizeBetaCode(code);
  if (!normalized) return false;
  return getConfiguredBetaCodes().includes(normalized);
}

export async function redeemBetaAccess(input: {
  workspaceId: string;
  userId: string;
  code: string;
}) {
  const normalizedCode = normalizeBetaCode(input.code);
  if (!isBetaCodeValid(normalizedCode)) {
    throw new BetaRedeemError("invalid_code", "Código beta inválido.");
  }

  const [existingEntitlement, existingRedemption] = await Promise.all([
    getActiveBetaEntitlementByWorkspace(input.workspaceId),
    getBetaRedemptionByWorkspace(input.workspaceId),
  ]);

  if (existingEntitlement || existingRedemption) {
    throw new BetaRedeemError(
      "already_redeemed",
      "Este workspace já resgatou acesso beta."
    );
  }

  if (getConfiguredBetaCodes().length === 0) {
    throw new BetaRedeemError(
      "beta_unavailable",
      "Acesso beta não está disponível no momento."
    );
  }

  return db.transaction(async (tx) => {
    const entitlement = await createBetaEntitlement(
      {
        workspaceId: input.workspaceId,
        sourceCode: normalizedCode,
        redeemedByUserId: input.userId,
      },
      tx
    );

    await recordBetaRedemption(
      {
        workspaceId: input.workspaceId,
        userId: input.userId,
        code: normalizedCode,
        entitlementId: entitlement.id,
      },
      tx
    );

    const grant = await createCreditGrant(
      {
        workspaceId: input.workspaceId,
        source: BETA_CREDIT_GRANT_SOURCE,
        sourceId: entitlement.id,
        amount: BETA_CREDIT_GRANT_AMOUNT,
        expiresAt: null,
      },
      tx
    );

    return { entitlement, grant };
  });
}

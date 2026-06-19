import { apiFetch } from "@/lib/api-client";
import {
  mapDecisionToStatus,
  type ReviewDecision,
  validateDirectionReason,
} from "@/lib/derivation-review-display";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export type { ReviewDecision };

export type ReviewDerivationVariables = {
  id?: string;
  status?: "approved" | "rejected";
  decision?: ReviewDecision;
  directionReason?: string;
  overrideReason?: string;
};

function buildReviewRequestBody(variables: ReviewDerivationVariables) {
  if (variables.decision) {
    return {
      status: mapDecisionToStatus(variables.decision),
      decision: variables.decision,
      ...(variables.directionReason
        ? { directionReason: variables.directionReason.trim() }
        : {}),
      ...(variables.overrideReason
        ? { overrideReason: variables.overrideReason.trim() }
        : {}),
    };
  }

  if (variables.status) {
    return { status: variables.status };
  }

  throw new Error("No review decision");
}

export function validateReviewDerivationInput(
  variables: ReviewDerivationVariables,
  translate: (key: string, values?: Record<string, string>) => string
): void {
  if (
    variables.decision === "nao_entra" ||
    variables.decision === "quase_regenerar"
  ) {
    if (!validateDirectionReason(variables.directionReason)) {
      throw new Error(
        translate("directionReasonRequired", { min: "8" })
      );
    }
  }
}

export function useReviewDerivation(derivationId?: string) {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");
  const tr = useTranslations("review");

  return useMutation({
    mutationFn: async (variables: ReviewDerivationVariables) => {
      validateReviewDerivationInput(variables, tr);

      const targetId = variables.id ?? derivationId;
      if (!targetId) {
        throw new Error("No derivation ID");
      }

      const body = buildReviewRequestBody(variables);
      const res = await apiFetch(`/api/derivations/${targetId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          details?: { hardFailures?: Array<{ message: string }> };
        };
        if (err.code === "derivationHardFailures") {
          const first = err.details?.hardFailures?.[0]?.message;
          throw new Error(first || err.error || t("statusUpdateFailed"));
        }
        throw new Error(err.error || t("statusUpdateFailed"));
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      const campaignId = data?.derivation?.campaignId;
      if (campaignId) {
        queryClient.invalidateQueries({ queryKey: ["campaigns", campaignId] });
      }

      const decision = variables.decision;
      const status = variables.status ?? (decision ? mapDecisionToStatus(decision) : undefined);
      const message =
        decision === "quase_regenerar"
          ? t("derivationQuaseRegenerar")
          : status === "approved"
            ? t("derivationApproved")
            : t("derivationRejected");

      addToast("success", message);
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : t("statusUpdateFailed")
      );
    },
  });
}

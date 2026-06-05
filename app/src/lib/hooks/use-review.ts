import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export function useReviewDerivation(derivationId?: string) {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");

  return useMutation({
    mutationFn: async ({
      status,
      id,
    }: {
      status: "approved" | "rejected";
      id?: string;
    }) => {
      const targetId = id ?? derivationId;
      if (!targetId) {
        throw new Error("No derivation ID");
      }
      const res = await apiFetch(`/api/derivations/${targetId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
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
      addToast(
        "success",
        variables.status === "approved" ? t("derivationApproved") : t("derivationRejected")
      );
    },
    onError: (err) => {
      addToast(
        "error",
        err instanceof Error ? err.message : t("statusUpdateFailed")
      );
    },
  });
}

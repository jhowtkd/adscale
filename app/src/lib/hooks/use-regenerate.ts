import { apiFetch } from "@/lib/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAppStore } from "@/lib/store";

export function useRegenerateDerivation(derivationId?: string) {
  const queryClient = useQueryClient();
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("toast");

  return useMutation({
    mutationFn: async (payload?: { feedback?: string; id?: string }) => {
      const targetId = payload?.id ?? derivationId;
      if (!targetId) {
        throw new Error("No derivation ID");
      }
      const res = await apiFetch(`/api/derivations/${targetId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: payload?.feedback }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // #region agent log
        fetch('http://127.0.0.1:7899/ingest/cfdc6907-57c9-49e8-855d-2427aa77ea62',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1bdb31'},body:JSON.stringify({sessionId:'1bdb31',location:'use-regenerate.ts:mutate',message:'regenerate failed',data:{derivationId:targetId,status:res.status,error:err.error,code:err.code},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
        // #endregion
        throw new Error(err.error || t("regenerationFailed"));
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      // #region agent log
      fetch('http://127.0.0.1:7899/ingest/cfdc6907-57c9-49e8-855d-2427aa77ea62',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1bdb31'},body:JSON.stringify({sessionId:'1bdb31',location:'use-regenerate.ts:onSuccess',message:'regenerate queued',data:{derivationId:variables?.id??derivationId??'unknown'},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
      // #endregion
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      addToast("success", t("regenerationQueued"));
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ["derivations"] });
      addToast(
        "error",
        err instanceof Error ? err.message : t("regenerationFailed")
      );
    },
  });
}

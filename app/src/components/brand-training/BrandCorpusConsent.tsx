"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ConsentState {
  purpose: "corpus_between_brands";
  canDecide: boolean;
  consent: { status: string; updatedAt: string; reviewedByName?: string } | null;
}

export function BrandCorpusConsent({ clientProfileId }: { clientProfileId: string }) {
  const t = useTranslations("brandTraining.corpusConsent");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const queryKey = ["brand-corpus-consent", clientProfileId];
  const url = `/api/client-profiles/${clientProfileId}`;
  const [decision, setDecision] = useState<{ action: "grant" | "revoke"; key: string } | null>(null);
  const state = useQuery({
    queryKey,
    queryFn: async (): Promise<ConsentState> => {
      const response = await apiFetch(url);
      if (!response.ok) throw new Error(t("loadError"));
      return response.json();
    },
  });
  const change = useMutation({
    mutationFn: async (input: NonNullable<typeof decision>) => {
      const response = await apiFetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": input.key },
        body: JSON.stringify({ action: input.action }),
      });
      if (!response.ok) throw new Error(t("changeError"));
      return response.json() as Promise<{ consent: NonNullable<ConsentState["consent"]> }>;
    },
    onSuccess: ({ consent }) => {
      queryClient.setQueryData<ConsentState>(queryKey, (current) => current ? { ...current, consent } : current);
      void queryClient.invalidateQueries({ queryKey });
      setDecision(null);
    },
  });

  if (state.isPending) return <p role="status">{tc("loading")}</p>;
  if (!state.data) return <p role="alert">{t("loadError")}</p>;
  const consent = state.data.consent;
  const action = consent?.status === "granted" ? "revoke" : "grant";

  return (
    <div className="space-y-5 text-sm text-[var(--text-secondary)]">
      <h2 className="font-medium text-[var(--text-primary)]">{t("title")}</h2>
      <p>{t("purpose")}</p>
      <p>{t("localLearning")}</p>
      <p role="status" className="text-[var(--text-primary)]">{t(consent?.status === "granted" ? "granted" : consent ? "revoked" : "absent")}</p>
      {consent ? <p>{t("lastChange")} {new Date(consent.updatedAt).toLocaleString("pt-BR")}{consent.reviewedByName ? ` · ${consent.reviewedByName}` : ""}</p> : null}
      <p>{t("revocationNotice")}</p>
      {state.data.canDecide ? (
        <Button variant="outline" disabled={change.isPending} onClick={() => { change.reset(); setDecision({ action, key: crypto.randomUUID() }); }}>
          {t(action)}
        </Button>
      ) : <p>{t("responsibleRoles")}</p>}
      <Dialog open={decision !== null} onOpenChange={(open) => { if (!open && !change.isPending) setDecision(null); }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t(decision?.action === "revoke" ? "revoke" : "grant")}</DialogTitle>
            <DialogDescription>{t(decision?.action === "revoke" ? "revokeConfirmation" : "grantConfirmation")}</DialogDescription>
          </DialogHeader>
          {change.isError ? <p role="alert" className="text-[var(--danger-text)]">{t("changeError")}</p> : null}
          <DialogFooter>
            <Button variant="outline" disabled={change.isPending} onClick={() => setDecision(null)}>{tc("cancel")}</Button>
            <Button disabled={change.isPending} onClick={() => { if (decision) change.mutate(decision); }}>
              {change.isPending ? tc("loading") : t(decision?.action === "revoke" ? "confirmRevoke" : "confirmGrant")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ArrowUpRight, Info, TriangleAlert } from "lucide-react";
import type { EquipeCardPayload } from "@/server/repositories/assistant-types";
import { useEquipeAccountState } from "@/lib/equipe/use-equipe";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import DiagnosisDocument, { parseDiagnosisContent } from "./DiagnosisDocument";

const tile = "rounded-xl bg-[var(--surface-raised)] px-3 py-2.5";

/** The immutable copy in the card is the fallback while (or if) the stored document cannot be read. */
function fromCard(card: EquipeCardPayload) {
  return parseDiagnosisContent({
    status: card.status === "insufficient" ? "insufficient" : "complete", brand: card.brand ?? null, summary: card.summary ?? "",
    channels: card.channels ?? [], opportunities: (card.opportunities ?? []).map(item => ({ title: item.title, sources: item.sources ?? [] })),
    notFound: card.notFound ?? [], sources: [], meta: { readingId: "", taskIntentId: null, model: null, promptVersion: null, inputSources: [] },
  });
}

function DocumentDialog({ card, open, onClose }: { card: EquipeCardPayload; open: boolean; onClose: () => void }) {
  const t = useTranslations("assistant.equipe.diagnosis");
  const query = useEquipeAccountState(open ? card.accountId : null);
  const stored = query.data?.documents?.find(document => document.id === card.documentId);
  const content = (stored ? parseDiagnosisContent(stored.content) : null) ?? fromCard(card);
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}>
      <DialogContent size="lg" className="p-6">
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{stored ? t("documentVersion", { version: stored.version }) : query.isLoading ? t("loadingDocument") : card.brand ?? ""}</DialogDescription>
        <div className="mt-4 overflow-y-auto focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" tabIndex={0}>{content ? <DiagnosisDocument content={content} /> : null}</div>
      </DialogContent>
    </Dialog>
  );
}

export default function DiagnosisCard({ card, latest = true, disabled, onSuggestion }: {
  card: EquipeCardPayload; latest?: boolean; disabled?: boolean; onSuggestion?: (text: string) => void;
}) {
  const t = useTranslations("assistant.equipe.diagnosis");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Only the newest diagnosis card offers its iscas; an old one would send a stale request.
  const suggestions = latest ? card.suggestions ?? [] : [];
  const intro = card.status === "failed" ? t("failedIntro") : card.status === "insufficient" ? t("insufficientIntro")
    : card.brand ? t("readyIntro", { brand: card.brand }) : t("readyIntroGeneric");
  const opportunities = card.opportunities ?? [];
  return (
    <div className="w-full max-w-[645px]" data-testid="equipe-diagnosis">
      <p className="mb-3 text-sm text-[var(--text-primary)]">{intro}</p>
      {card.status === "failed" ? (
        <div className="flex items-start gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 text-sm sm:p-[18px]" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--warning-dot)]" aria-hidden="true" />
          <p className="text-[var(--text-secondary)]">{t("failedDetail")}</p>
        </div>
      ) : (
        <div className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 sm:p-[18px]">
          <div className="flex items-start justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              {t("title")}
              <span className="rounded border border-[var(--border-subtle)] px-1 font-mono text-[9px] font-normal text-[var(--text-muted)]">{t("ai")}</span>
            </h3>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
              {t("open")}<ArrowUpRight className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">{card.summary}</p>
          {card.channels?.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {card.channels.map(channel => (
                <div key={channel.source} className={tile}>
                  <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: channel.source === "instagram" ? "var(--info-dot)" : "var(--warning-dot)" }} />
                    {channel.source === "instagram" ? t("fromInstagram") : t("fromSite")}
                  </span>
                  <span className="mt-1 block text-sm font-medium">{channel.message}</span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{opportunities.length ? t("opportunities", { count: opportunities.length }) : t("noOpportunities")}</p>
          {opportunities.length ? (
            <ol className="mt-2 space-y-3">
              {opportunities.map((opportunity, index) => (
                <li key={index} className="flex items-start gap-3 text-sm">
                  <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-raised)] text-xs font-semibold">{index + 1}</span>
                  <span className="pt-0.5">{opportunity.title}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {card.notFound?.length ? (
            <p className="mt-4 flex items-start gap-2 text-xs text-[var(--text-muted)]">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{t("notFound", { items: new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(card.notFound) })}</span>
            </p>
          ) : null}
        </div>
      )}
      {suggestions.length > 0 ? (
        <div className="mt-2 flex w-full flex-col gap-1.5" data-testid="assistant-suggestions">
          {suggestions.map(text => (
            <button key={text} type="button" disabled={disabled || !onSuggestion} onClick={() => onSuggestion?.(text)}
              className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-4 py-2.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
              <ArrowRight className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />{text}
            </button>
          ))}
        </div>
      ) : null}
      {card.status !== "failed" && open ? <DocumentDialog card={card} open={open} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

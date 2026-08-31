"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCreativeInspirations } from "@/lib/hooks/use-creative-inspirations";
import type { CreativeInspiration } from "@/server/application/list-creative-inspirations";

export function BrandInspirations({
  clientProfileId,
  onAttach,
}: {
  clientProfileId: string | null;
  onAttach: (inspiration: CreativeInspiration) => boolean | Promise<boolean>;
}) {
  const t = useTranslations("dashboard.home.composer.inspirations");
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CreativeInspiration | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const { data = [], isLoading, isError, refetch } = useCreativeInspirations(clientProfileId);
  const attach = async (inspiration: CreativeInspiration) => {
    setPendingId(inspiration.id);
    setAttachError(null);
    try {
      const attached = await onAttach({ ...inspiration, suggestedIntent: "restyle" });
      if (attached) {
        setOpen(false);
        window.setTimeout(() => document.getElementById("creative-composer-original-source")?.focus(), 0);
      } else setAttachError(t("attachFailed"));
    } catch {
      setAttachError(t("attachFailed"));
    } finally {
      setPendingId(null);
    }
  };

  return <>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<button type="button" className="rounded-[var(--radius-control)] border border-[var(--border-default)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" />}>{t("add")}</SheetTrigger>
      <SheetContent side="right" size="lg">
        <SheetHeader><SheetTitle>{t("title")}</SheetTitle></SheetHeader>
        <SheetBody>
          {isLoading ? <p role="status">{t("loading")}</p> : null}
          {isError ? <div><p role="alert">{t("loadFailed")}</p><button type="button" onClick={() => void refetch()}>{t("retry")}</button></div> : null}
          {attachError ? <p role="alert">{attachError}</p> : null}
          {!isLoading && !isError && data.length === 0 ? <p role="status">{t("empty")}</p> : null}
          {!isLoading && !isError && data.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">
            {data.map((inspiration) => <article key={`${inspiration.source}:${inspiration.id}`} className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] p-3">
              <button type="button" aria-label={t("previewAria", { title: inspiration.title })} onClick={() => setPreview(inspiration)} className="block w-full overflow-hidden rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                {inspiration.previewUrl ? <img src={inspiration.previewUrl} alt="" className="h-auto w-full" /> : <span className="flex aspect-[4/3] items-center justify-center bg-[var(--surface-inset)] text-[var(--text-muted)]"><ImageIcon /></span>}
              </button>
              <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{inspiration.title}</p>
              <p className="text-xs text-[var(--text-muted)]">{t(`origin.${inspiration.source}`)}</p>
              <button type="button" disabled={pendingId === inspiration.id} onClick={() => void attach(inspiration)} className="mt-2 text-sm font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{t("useForStyle")}</button>
            </article>)}
          </div> : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
    <Dialog open={Boolean(preview)} onOpenChange={(next) => !next && setPreview(null)}>
      <DialogContent size="lg"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader><DialogBody>{preview?.previewUrl ? <img src={preview.previewUrl} alt={t("previewAlt", { title: preview.title })} className="h-auto w-full" /> : null}</DialogBody></DialogContent>
    </Dialog>
  </>;
}

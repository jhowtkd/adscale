"use client";

import { useLocale, useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  currentVersionOf,
  displayStateOf,
  itemImageUrl,
  versionLabel,
} from "@/lib/equipe/api";
import { useEquipeItemDetail } from "@/lib/equipe/use-equipe";
import EquipeStatePill from "./EquipeStatePill";
import EquipeAuthor from "./EquipeAuthor";
import ItemOverlayActions from "./ItemOverlayActions";
import ItemOverlayHistory from "./ItemOverlayHistory";
import { formatDate, formatDateTime, shortHash } from "./equipe-format";

// The open item (C6) as an overlay on /pipeline via ?item=<id>: final image,
// full caption, destination, date/time, version and receipts. Decisions live
// in ItemOverlayActions, history and receipts in ItemOverlayHistory.

function ItemOverlayBody({ accountId, itemId }: { accountId: string; itemId: string }) {
  const t = useTranslations("equipe.item");
  const tStates = useTranslations("equipe.states");
  const locale = useLocale();
  const { data, isLoading, error, refetch } = useEquipeItemDetail(accountId, itemId);

  if (isLoading) {
    return (
      <DialogBody>
        <p className="py-8 text-center text-sm text-[var(--text-muted)]" role="status">
          {t("loading")}
        </p>
      </DialogBody>
    );
  }
  if (error || !data) {
    return (
      <DialogBody>
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="text-sm text-[var(--text-secondary)]">{t("loadError")}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {t("retry")}
          </Button>
        </div>
      </DialogBody>
    );
  }

  const current = currentVersionOf(data);
  const image = itemImageUrl(data.item, current);
  const label = versionLabel(data.versions, data.item.currentVersionHash);
  const when = formatDateTime(data.item.scheduledFor ?? current?.scheduledFor, locale);
  const batchDue = formatDateTime(data.batch?.approveByAt, locale);
  const warnings = [
    ...(data.activeIntent?.lastError === "instagram_destination_changed" ? [t("instagramDestinationChanged")] : []),
    ...(data.review.triage?.warnings ?? []),
    ...((data.findings.find((f) => f.versionHash === data.item.currentVersionHash)?.findings as { warnings?: string[] } | null)?.warnings ?? []),
  ];

  return (
    <>
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle data-testid="item-overlay-title">
            {when ?? formatDate(data.item.createdAt, locale) ?? t("untitledItem")}
          </DialogTitle>
          <EquipeStatePill state={displayStateOf(data.item.status, data.review.status)} />
        </div>
        <DialogDescription>
          {[data.batch?.title, label, batchDue ? t("decideBy", { date: batchDue }) : null]
            .filter(Boolean)
            .join(" · ")}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="max-h-80 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain bg-[var(--surface-inset)]"
            data-testid="item-overlay-image"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-32 place-items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-inset)] text-[var(--text-muted)]"
          >
            <ImageIcon size={24} />
          </span>
        )}

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t("captionLabel")} · {label ?? shortHash(data.item.currentVersionHash ?? "")}
            {current ? (
              <>
                {" · "}
                <EquipeAuthor authorRole={current.authorRole} />
              </>
            ) : null}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text-primary)]" data-testid="item-overlay-caption">
            {current?.caption || t("noCaption")}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-[var(--text-muted)]">{t("destination")}</dt>
            <dd className="text-[var(--text-primary)]">{data.destinationAccount ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("version")}</dt>
            <dd className="text-[var(--text-primary)]">
              {[label, data.item.currentVersionHash ? shortHash(data.item.currentVersionHash) : null]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
          </div>
        </dl>

        {current && !current.destinationIgUserId && current.destination?.startsWith("instagram:") &&
          (data.item.status === "awaiting_approval" || data.item.status === "available_for_download") ? (
            <p className="text-xs text-[var(--text-secondary)]" data-testid="item-prepared-before-connection">
              {t("preparedBeforeConnection")}
            </p>
          ) : null}

        {warnings.length > 0 ? (
          <div
            className="rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-bg)] px-3 py-2"
            data-testid="item-overlay-warnings"
          >
            <p className="text-xs font-medium text-[var(--warning-text)]">
              {tStates.has(data.review.status) ? tStates(data.review.status) : data.review.status}
            </p>
            <ul className="mt-1 list-disc pl-4 text-xs text-[var(--warning-text)]">
              {warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
            {data.review.triage?.path === "update_catalog_only" ? (
              <p className="mt-1 text-xs text-[var(--warning-text)]">{t("catalogPointer")}</p>
            ) : null}
          </div>
        ) : null}

        <ItemOverlayActions accountId={accountId} detail={data} />
        <ItemOverlayHistory detail={data} />
      </DialogBody>
    </>
  );
}

export default function ItemOverlay({
  accountId,
  itemId,
  open,
  onOpenChange,
}: {
  accountId: string;
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" data-testid="item-overlay">
        {itemId ? (
          <ItemOverlayBody key={itemId} accountId={accountId} itemId={itemId} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

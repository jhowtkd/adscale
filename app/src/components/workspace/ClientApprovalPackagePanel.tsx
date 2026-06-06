"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Link2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useApprovalPackage,
  useSaveApprovalPackage,
} from "@/lib/hooks/use-approval-package";
import { useExport } from "@/lib/hooks/use-export";
import { useAppStore } from "@/lib/store";
import { useMissionInsightOptional } from "@/components/mission-insights/MissionInsightProvider";

interface ClientApprovalPackagePanelProps {
  campaignId: string;
  className?: string;
}

function statusLabel(status: string) {
  if (status === "approved") return "approved";
  if (status === "generating" || status === "queued") return "processing";
  if (status === "failed") return "failed";
  return status;
}

export default function ClientApprovalPackagePanel({
  campaignId,
  className,
}: ClientApprovalPackagePanelProps) {
  const t = useTranslations("clientApprovalPackage");
  const tc = useTranslations("common");
  const addToast = useAppStore((s) => s.addToast);
  const missionInsight = useMissionInsightOptional();
  const { data, isLoading, isError } = useApprovalPackage(campaignId);
  const savePackage = useSaveApprovalPackage(campaignId);
  const exportMutation = useExport();

  const [draft, setDraft] = useState<{
    selectedRootIds: string[];
    notes: string;
  } | null>(null);

  const selectedRootIds =
    draft?.selectedRootIds ?? data?.selectedRootIds ?? [];
  const notes = draft?.notes ?? data?.package.notes ?? "";

  const hasApprovedRoots = (data?.availableRoots.length ?? 0) > 0;

  const toggleRoot = (id: string) => {
    setDraft((prev) => {
      const current = prev?.selectedRootIds ?? data?.selectedRootIds ?? [];
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      return {
        selectedRootIds: next,
        notes: prev?.notes ?? data?.package.notes ?? "",
      };
    });
  };

  const handleSave = () => {
    if (selectedRootIds.length === 0) {
      addToast("error", t("selectAtLeastOne"));
      return;
    }

    savePackage.mutate(
      { derivationIds: selectedRootIds, notes },
      {
        onSuccess: () => {
          setDraft(null);
          addToast("success", t("packageSaved"));
        },
        onError: () => addToast("error", tc("shareLinkFailed")),
      }
    );
  };

  const handleCopyLink = async () => {
    if (!data?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      addToast("success", tc("shareLinkCopied"));
      missionInsight?.maybePromptMissionInsight({
        moment: "share_first",
        missionKey: "share",
        campaignId,
        diagnosticContext: { operation: "share_link_copy" },
      });
    } catch {
      addToast("error", tc("shareLinkFailed"));
    }
  };

  const handleDownloadItem = (derivationId: string) => {
    exportMutation.mutate({
      type: "individual",
      derivationId,
      format: "png",
    });
  };

  const handleDownloadBatch = () => {
    exportMutation.mutate({
      type: "batch",
      campaignId,
      format: "png",
    });
  };

  const packageItems = useMemo(
    () => data?.package.items ?? [],
    [data?.package.items]
  );

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-[var(--border-dim)] p-4", className)}>
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="size-4 animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  if (isError || !hasApprovedRoots) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 space-y-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t("title")}
          </h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t("description")}
          </p>
        </div>
        {data?.package.isStale && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400">
            <AlertTriangle className="size-3" />
            {t("stale")}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-[var(--text-primary)]">
          {t("selectCreatives")}
        </p>
        <div className="space-y-2">
          {data?.availableRoots.map((root) => (
            <label
              key={root.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border-dim)] px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedRootIds.includes(root.id)}
                onChange={() => toggleRoot(root.id)}
                className="accent-[var(--accent-green)]"
              />
              <span className="min-w-0 flex-1 text-[var(--text-primary)]">
                {root.ctaText || t("untitledCreative")}
              </span>
              {root.format && (
                <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ghost)]">
                  {root.format}
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label
          htmlFor={`approval-notes-${campaignId}`}
          className="text-xs font-medium text-[var(--text-primary)]"
        >
          {t("notesLabel")}
        </label>
        <textarea
          id={`approval-notes-${campaignId}`}
          value={notes}
          onChange={(event) =>
            setDraft((prev) => ({
              selectedRootIds:
                prev?.selectedRootIds ?? data?.selectedRootIds ?? [],
              notes: event.target.value,
            }))
          }
          rows={3}
          className="w-full rounded-lg border border-[var(--border-dim)] bg-[var(--deep-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
          placeholder={t("notesPlaceholder")}
        />
      </div>

      {packageItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-primary)]">
            {t("packageItems")}
          </p>
          <ul className="space-y-2">
            {packageItems.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border-dim)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">
                    {item.creativeNote}
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    {item.format ? `${item.format} · ` : ""}
                    {t(`status.${statusLabel(item.status)}`)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {item.status === "approved" && item.hasOutput && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDownloadItem(item.id)}
                      disabled={exportMutation.isPending}
                      aria-label={t("downloadItem")}
                    >
                      <Download className="size-3.5" />
                    </Button>
                  )}
                  {item.status === "approved" ? (
                    <CheckCircle2 className="size-4 text-[var(--accent-green-text)]" />
                  ) : (
                    <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={savePackage.isPending || selectedRootIds.length === 0}
        >
          {savePackage.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : data?.package.isStale ? (
            <RefreshCw className="size-4" />
          ) : (
            <Link2 className="size-4" />
          )}
          {data?.shareUrl
            ? data.package.isStale
              ? t("refreshPackage")
              : t("updatePackage")
            : t("createPackage")}
        </Button>

        {data?.shareUrl && (
          <Button type="button" variant="outline" onClick={handleCopyLink}>
            <Copy className="size-4" />
            {t("copyShareLink")}
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={handleDownloadBatch}
          disabled={exportMutation.isPending}
        >
          <Download className="size-4" />
          {t("downloadAll")}
        </Button>
      </div>

      {data?.expiresAt && (
        <p className="text-[10px] text-[var(--text-muted)]">
          {t("expiresAt", {
            date: new Date(data.expiresAt).toLocaleDateString(),
          })}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Download, Trash2, AlertTriangle, Shield, FileText, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

export default function PrivacyTab() {
  const t = useTranslations("settings.privacy");
  const tCommon = useTranslations("common");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState("");

  async function handleExport() {
    setError("");
    setExporting(true);
    try {
      const res = await apiFetch("/api/user/export");
      if (!res.ok) throw new Error("Failed to export data");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adscale-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("exportError"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== t("deleteConfirmKeyword")) {
      setError(t("deleteErrorKeyword"));
      return;
    }
    setError("");
    setDeleting(true);
    try {
      const res = await apiFetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) throw new Error("Failed to delete account");
      window.location.href = "/";
    } catch {
      setError(t("deleteError"));
      setDeleting(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Download size={18} className="text-[var(--utility-icon)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("exportTitle")}</h3>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{t("exportDescription")}</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="mt-4 inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--surface-inset)] disabled:opacity-60"
        >
          {exporting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
          {exporting ? t("exporting") : t("exportButton")}
        </button>
      </div>

      <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <FileText size={18} className="text-[var(--utility-icon)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("legalTitle")}</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/privacy"
            target="_blank"
            className="inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm text-[var(--text-primary)] transition-all hover:bg-[var(--surface-inset)]"
          >
            <Shield size={16} aria-hidden="true" />
            {t("privacyPolicy")}
          </Link>
          <Link
            href="/terms"
            target="_blank"
            className="inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-4 py-2 text-sm text-[var(--text-primary)] transition-all hover:bg-[var(--surface-inset)]"
          >
            <FileText size={16} aria-hidden="true" />
            {t("termsOfUse")}
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Trash2 size={18} className="text-[var(--danger-text)]" />
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{t("deleteTitle")}</h3>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{t("deleteDescription")}</p>
        {!showDeleteDialog ? (
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="mt-4 inline-flex min-h-[var(--control-touch)] items-center gap-2 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 text-sm font-medium text-[var(--danger-text)] transition-all hover:bg-[var(--danger-bg)]"
          >
            <AlertTriangle size={16} aria-hidden="true" />
            {t("deleteButton")}
          </button>
        ) : (
          <div className="mt-4 space-y-3">
            {error ? (
              <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]" role="alert">
                {error}
              </div>
            ) : null}
            <p className="text-xs text-[var(--text-secondary)]">
              {t("deleteConfirmHint", { keyword: t("deleteConfirmKeyword") })}
            </p>
            <input
              aria-label={t("deleteConfirmAria")}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t("deleteConfirmPlaceholder")}
              className="h-11 w-full rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus-visible:border-[var(--danger-border)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setConfirmText("");
                  setError("");
                }}
                className="min-h-[var(--control-touch)] flex-1 rounded-md border border-[var(--border-dim)] bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--surface-inset)]"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="min-h-[var(--control-touch)] flex-1 rounded-md bg-[var(--danger-text)] text-sm font-medium text-[var(--text-on-accent)] transition-all hover:opacity-90 disabled:opacity-60"
              >
                {deleting ? t("deleting") : t("deleteConfirmButton")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import {
  settingsButtonClass,
  settingsDangerButtonClass,
  settingsFieldClass,
  settingsHintClass,
  settingsSectionTitleClass,
} from "@/components/settings/settings-chrome";

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
      const res = await apiFetch("/api/user/export", { timeoutMs: 10 * 60_000 });
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
    <div className="divide-y divide-[var(--border-dim)]">
      <section className="space-y-3 pb-8">
        <h3 className={settingsSectionTitleClass}>{t("exportTitle")}</h3>
        <p className="text-sm text-[var(--text-secondary)]">{t("exportDescription")}</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className={settingsButtonClass}
        >
          {exporting ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
          {exporting ? t("exporting") : t("exportButton")}
        </button>
      </section>

      <section className="space-y-3 py-8">
        <h3 className={settingsSectionTitleClass}>{t("legalTitle")}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link
            href="/privacy"
            target="_blank"
            className="text-sm text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            {t("privacyPolicy")}
          </Link>
          <Link
            href="/terms"
            target="_blank"
            className="text-sm text-[var(--text-primary)] underline-offset-4 hover:underline"
          >
            {t("termsOfUse")}
          </Link>
        </div>
      </section>

      <section className="space-y-3 pt-8">
        <h3 className={settingsSectionTitleClass}>{t("deleteTitle")}</h3>
        <p className="text-sm text-[var(--text-secondary)]">{t("deleteDescription")}</p>
        {!showDeleteDialog ? (
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className={settingsDangerButtonClass}
          >
            {t("deleteButton")}
          </button>
        ) : (
          <div className="space-y-3">
            {error ? (
              <p className="text-sm text-[var(--danger-text)]" role="alert">
                {error}
              </p>
            ) : null}
            <p className={settingsHintClass}>
              {t("deleteConfirmHint", { keyword: t("deleteConfirmKeyword") })}
            </p>
            <input
              aria-label={t("deleteConfirmAria")}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t("deleteConfirmPlaceholder")}
              className={settingsFieldClass}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setConfirmText("");
                  setError("");
                }}
                className={settingsButtonClass}
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={settingsDangerButtonClass}
              >
                {deleting ? t("deleting") : t("deleteConfirmButton")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

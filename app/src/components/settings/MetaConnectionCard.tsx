"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Megaphone, RefreshCw, Trash2, Unplug } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import {
  settingsButtonClass,
  settingsDangerButtonClass,
  settingsHintClass,
  settingsRowClass,
} from "@/components/settings/settings-chrome";

interface MetaAccountSummary {
  id: string;
  adAccountId: string;
  name: string | null;
  currency: string;
  brandId: string | null;
}

interface MetaStatus {
  connected: boolean;
  mock?: boolean;
  status?: string;
  lastSyncAt?: string | null;
  lastSyncError?: string | null;
  accounts?: MetaAccountSummary[];
}

interface BrandSummary {
  id: string;
  name: string;
}

/**
 * Conexão Meta — Configurações → Integrações (#347).
 * Substitui o mock de export: OAuth real (ou loopback mock sem #348),
 * vínculo conta ↔ marca, sync sob demanda e disconnect com purge imediato.
 * owner/admin agem; member lê (403 vira toast).
 */
export function MetaConnectionCard() {
  const t = useTranslations("settings.metaConnection");
  const addToast = useAppStore((s) => s.addToast);
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch("/api/workspace/meta-connection");
      if (res.status === 401) {
        setStatus(null);
        return;
      }
      if (!res.ok) return;
      setStatus((await res.json()) as MetaStatus);
    } catch {
      // sem conexão: mantém o último estado
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/workspace/meta-connection")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setStatus(null);
          return;
        }
        if (!res.ok) return;
        setStatus((await res.json()) as MetaStatus);
        const flag = new URLSearchParams(window.location.search).get("meta");
        if (flag === "connected") addToast("success", t("connectedToast"));
        else if (flag === "error") addToast("error", t("connectFailed"));
      })
      .catch(() => undefined);
    apiFetch("/api/client-profiles")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const body = (await res.json()) as { profiles: BrandSummary[] };
        setBrands(body.profiles ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const forbidden = useCallback(
    (res: Response) => {
      if (res.status === 403) {
        addToast("error", t("forbidden"));
        return true;
      }
      return false;
    },
    [addToast, t]
  );

  const syncNow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/workspace/meta-connection/sync", { method: "POST" });
      if (!res.ok) {
        if (!forbidden(res)) addToast("error", t("syncFailed"));
        return;
      }
      addToast("success", t("syncQueued"));
      void reload();
    } finally {
      setBusy(false);
    }
  }, [addToast, busy, forbidden, reload, t]);

  const disconnect = useCallback(async () => {
    if (!arming) {
      setArming(true);
      return;
    }
    setArming(false);
    const res = await apiFetch("/api/workspace/meta-connection", { method: "DELETE" });
    if (!res.ok) {
      if (!forbidden(res)) addToast("error", t("disconnectFailed"));
      return;
    }
    addToast("success", t("disconnected"));
    void reload();
  }, [addToast, arming, forbidden, reload, t]);

  const link = useCallback(
    async (accountId: string, brandId: string | null) => {
      const res = await apiFetch("/api/workspace/meta-connection/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, brandId }),
      });
      if (!res.ok) {
        if (!forbidden(res)) addToast("error", t("linkFailed"));
        return;
      }
      void reload();
    },
    [addToast, forbidden, reload, t]
  );

  if (status === null) return null;

  return (
    <section aria-label={t("title")} className="mb-6" data-testid="meta-connection-card">
      <div className={settingsRowClass}>
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: "var(--neutral-bg)", color: "var(--utility-icon)" }}
        >
          <Megaphone size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {t("title")}{" "}
            <span className={settingsHintClass}>
              {status.connected ? t(`status.${status.status ?? "ativa"}`) : t("status.disconnected")}
              {status.mock ? ` · ${t("mockBadge")}` : ""}
            </span>
          </p>
          <p className={settingsHintClass}>
            {status.connected
              ? status.lastSyncAt
                ? t("lastSync", { when: new Date(status.lastSyncAt).toLocaleString() })
                : t("neverSynced")
              : t("description")}
          </p>
          {status.connected && status.lastSyncError ? (
            <p className={settingsHintClass} style={{ color: "var(--danger-text)" }}>
              {status.lastSyncError}
            </p>
          ) : null}
        </div>
        <div className="shrink-0">
          {status.connected ? (
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="meta-sync-now"
                disabled={busy}
                onClick={() => void syncNow()}
                className={settingsButtonClass}
              >
                <RefreshCw size={14} aria-hidden /> {t("syncNow")}
              </button>
              <button
                type="button"
                data-testid="meta-disconnect"
                onClick={() => void disconnect()}
                className={arming ? settingsDangerButtonClass : settingsButtonClass}
              >
                {arming ? <Trash2 size={14} aria-hidden /> : <Unplug size={14} aria-hidden />}{" "}
                {arming ? t("confirmDisconnect") : t("disconnect")}
              </button>
            </div>
          ) : (
            <a
              data-testid="meta-connect"
              href="/api/workspace/meta-connection/oauth/start"
              className={settingsButtonClass}
            >
              {t("connect")}
            </a>
          )}
        </div>
      </div>

      {status.connected && (status.accounts?.length ?? 0) > 0 ? (
        <ul className="flex flex-col gap-2">
          {(status.accounts ?? []).map((account) => (
            <li
              key={account.id}
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--text-primary)]">
                  {account.name ?? account.adAccountId}{" "}
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    {account.adAccountId} · {account.currency}
                  </span>
                </p>
              </div>
              {brands.length > 0 ? (
                <select
                  data-testid={`meta-link-${account.id}`}
                  value={account.brandId ?? ""}
                  onChange={(event) => void link(account.id, event.target.value || null)}
                  aria-label={t("linkLabel")}
                  className="max-w-55 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1 text-sm text-[var(--text-primary)]"
                >
                  <option value="">{t("unlinked")}</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

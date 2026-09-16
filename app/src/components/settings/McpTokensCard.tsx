"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Copy, KeyRound, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import {
  settingsButtonClass,
  settingsDangerButtonClass,
  settingsHintClass,
  settingsRowClass,
} from "@/components/settings/settings-chrome";

interface McpTokenSummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/**
 * Bearer tokens do MCP — Configurações → Integrações (#356 rev. 2).
 * owner/admin criam e revogam. Na fatia OAuth esta tela vira
 * grants ativos + revoke, sem mint de secret.
 */
export function McpTokensCard() {
  const t = useTranslations("settings.mcp");
  const addToast = useAppStore((s) => s.addToast);
  const [tokens, setTokens] = useState<McpTokenSummary[] | null>(null);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<{ token: string; prefix: string } | null>(null);
  const [arming, setArming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/workspace/mcp-tokens")
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 403 || res.status === 401) {
          setTokens(null);
          return;
        }
        if (!res.ok) return;
        const body = (await res.json()) as { tokens: McpTokenSummary[] };
        setTokens(body.tokens);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/workspace/mcp-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        addToast("error", t("createFailed"));
        return;
      }
      const body = (await res.json()) as { id: string; token: string; prefix: string };
      setSecret({ token: body.token, prefix: body.prefix });
      setName("");
      const list = await apiFetch("/api/workspace/mcp-tokens");
      if (list.ok) {
        setTokens(((await list.json()) as { tokens: McpTokenSummary[] }).tokens);
      }
    } finally {
      setBusy(false);
    }
  }, [addToast, busy, name, t]);

  const revoke = useCallback(
    async (id: string) => {
      if (arming !== id) {
        setArming(id);
        return;
      }
      setArming(null);
      const res = await apiFetch(`/api/workspace/mcp-tokens/${id}`, { method: "DELETE" });
      if (!res.ok) {
        addToast("error", t("revokeFailed"));
        return;
      }
      setTokens((current) =>
        (current ?? []).map((token) =>
          token.id === id ? { ...token, revokedAt: new Date().toISOString() } : token
        )
      );
      addToast("success", t("revoked"));
    },
    [addToast, arming, t]
  );

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        addToast("success", t("copied"));
      } catch {
        addToast("error", t("copyFailed"));
      }
    },
    [addToast, t]
  );

  if (tokens === null) return null;

  return (
    <section aria-label={t("title")} className="mb-6">
      <div className={settingsRowClass}>
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: "var(--neutral-bg)", color: "var(--utility-icon)" }}
        >
          <Bot size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">{t("title")}</p>
          <p className={settingsHintClass}>{t("description")}</p>
        </div>
      </div>

      {secret ? (
        <div className="mb-3 rounded-[var(--radius-control)] border border-[var(--warning-border)] bg-[var(--surface-raised)] p-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">{t("secretTitle")}</p>
          <p className={settingsHintClass}>{t("secretWarning")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code
              data-testid="mcp-token-secret"
              className="min-w-0 flex-1 truncate rounded bg-[var(--surface-inset)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]"
            >
              {secret.token}
            </code>
            <button type="button" onClick={() => void copy(secret.token)} className={settingsButtonClass}>
              <Copy size={14} aria-hidden /> {t("copy")}
            </button>
            <button type="button" onClick={() => setSecret(null)} className={settingsButtonClass}>
              {t("dismiss")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex items-center gap-2">
        <input
          data-testid="mcp-token-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("namePlaceholder")}
          maxLength={80}
          className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus-ring)]"
        />
        <button
          type="button"
          data-testid="mcp-token-create"
          disabled={!name.trim() || busy}
          onClick={() => void create()}
          className={settingsButtonClass}
        >
          <KeyRound size={14} aria-hidden /> {t("create")}
        </button>
      </div>

      {tokens.length === 0 ? (
        <p className={settingsHintClass}>{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--text-primary)]">
                  {token.name}{" "}
                  <span className="font-mono text-xs text-[var(--text-muted)]">{token.prefix}…</span>
                </p>
                <p className={settingsHintClass}>
                  {token.revokedAt
                    ? t("revokedLabel")
                    : token.lastUsedAt
                      ? t("lastUsed", { when: new Date(token.lastUsedAt).toLocaleString() })
                      : t("neverUsed")}
                </p>
              </div>
              {!token.revokedAt ? (
                <button
                  type="button"
                  data-testid={`mcp-token-revoke-${token.id}`}
                  onClick={() => void revoke(token.id)}
                  className={arming === token.id ? settingsDangerButtonClass : settingsButtonClass}
                >
                  <Trash2 size={14} aria-hidden />{" "}
                  {arming === token.id ? t("confirmRevoke") : t("revoke")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

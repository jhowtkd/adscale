"use client";

import { useSyncExternalStore, useState } from "react";
import Link from "next/link";

export type ConsentPreferences = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
};

const STORAGE_KEY = "adscale_cookie_consent";

function getStoredConsent(): ConsentPreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConsent(prefs: ConsentPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function useCookieConsent() {
  const [prefs, setPrefs] = useState<ConsentPreferences | null>(() => getStoredConsent());
  const mounted = useMounted();

  const acceptAll = () => {
    const all: ConsentPreferences = { necessary: true, analytics: true, marketing: true };
    saveConsent(all);
    setPrefs(all);
  };

  const acceptNecessary = () => {
    const minimal: ConsentPreferences = { necessary: true, analytics: false, marketing: false };
    saveConsent(minimal);
    setPrefs(minimal);
  };

  const update = (next: ConsentPreferences) => {
    saveConsent(next);
    setPrefs(next);
  };

  return { prefs, mounted, acceptAll, acceptNecessary, update };
}

export default function CookieBanner() {
  const { prefs, mounted, acceptAll, acceptNecessary } = useCookieConsent();
  const [showDetails, setShowDetails] = useState(false);

  if (!mounted || prefs !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Consentimento de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-dim)] bg-[var(--surface-base)] p-4 shadow-lg sm:px-6"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-[var(--text-secondary)]">
          <p>
            Utilizamos cookies para melhorar sua experiencia.{" "}
            <Link href="/privacy" className="text-[var(--accent-green)] hover:underline">
              Saiba mais
            </Link>
            .
          </p>
        </div>

        {!showDetails ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={acceptNecessary}
              className="h-9 rounded-md border border-[var(--border-dim)] px-4 text-xs font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--surface-raised)]"
            >
              Apenas necessarios
            </button>
            <button
              type="button"
              onClick={acceptAll}
              className="h-9 rounded-md bg-[var(--accent-green)] px-4 text-xs font-medium text-[var(--ink)] transition-all hover:bg-[var(--accent-green-light)]"
            >
              Aceitar todos
            </button>
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="h-9 px-3 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Gerenciar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="cookie-necessary" className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" id="cookie-necessary" checked readOnly disabled className="accent-[var(--accent-green)]" />
              Necessarios (obrigatorio)
            </label>
            <label htmlFor="cookie-analytics" className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" id="cookie-analytics" className="accent-[var(--accent-green)]" />
              Analiticos
            </label>
            <label htmlFor="cookie-marketing" className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <input type="checkbox" id="cookie-marketing" className="accent-[var(--accent-green)]" />
              Marketing
            </label>
            <button
              type="button"
              onClick={() => {
                const analytics = (document.getElementById("cookie-analytics") as HTMLInputElement)?.checked ?? false;
                const marketing = (document.getElementById("cookie-marketing") as HTMLInputElement)?.checked ?? false;
                saveConsent({ necessary: true, analytics, marketing });
                window.location.reload();
              }}
              className="h-9 rounded-md bg-[var(--accent-green)] px-4 text-xs font-medium text-[var(--ink)] transition-all hover:bg-[var(--accent-green-light)]"
            >
              Salvar preferencias
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CookieBanner />
    </>
  );
}

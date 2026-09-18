import Image from "next/image";
import Link from "next/link";

/**
 * Local containment page for `/hi` (#439). Rendered when the interactive
 * visitor island is off (`HI_PAGE_ENABLED=false`) or whenever the route
 * needs a zero-dependency fallback: HTTP 200, zero external requests
 * (same-origin assets only, existing CSP untouched), functional login CTA,
 * and no redirect to `/` anywhere in this tree (anti-recursion: proxy sends
 * unauthenticated `/` here, so this page must never send visitors back).
 */
export function HiFallback() {
  return (
    <div className="min-h-screen bg-[var(--canvas)]">
      <a
        href="#hi-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:px-4 focus:py-2 focus:text-[var(--text)]"
      >
        Pular para o conteúdo
      </a>
      <header className="px-6 pt-8 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <Image
            src="/hi-assets/Adscale.svg"
            alt="ADScale"
            className="block h-[22px] w-auto max-w-[130px]"
            width={813}
            height={142}
            priority
            unoptimized
          />
        </div>
      </header>
      <main id="hi-main" className="mx-auto max-w-3xl px-6 py-16 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
          Acesse o Estúdio
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--text-muted)]">
          Crie peças, variações e adaptações de formato com o ADScale. Entre
          para continuar no Estúdio.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/login?callbackUrl=%2Fhi"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--accent-primary)] px-6 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
          >
            Entrar
          </Link>
          <div className="flex gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-[var(--text-muted)] underline-offset-4 hover:underline"
            >
              Privacidade
            </Link>
            <Link
              href="/terms"
              className="text-[var(--text-muted)] underline-offset-4 hover:underline"
            >
              Termos
            </Link>
          </div>
        </div>
      </main>
      <footer className="mx-auto max-w-3xl px-6 pb-10 sm:px-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
          ADScale © 2026
        </p>
      </footer>
    </div>
  );
}

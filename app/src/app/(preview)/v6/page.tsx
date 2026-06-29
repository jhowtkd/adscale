import Link from "next/link";
import { mockupIndex } from "./_fixtures/preview-data";

export default function V6IndexPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="product-page-title text-[var(--text-primary)]">
          Redesign v6 — Preview Routes
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Índice dos 13 mockups. Cada rota serve o componente React migrado com
          fixtures. Ver <Link href="https://github.com/jhowtkd/adscale" className="text-[var(--accent-primary)] underline">PLAN.md</Link> e MAPPING.md no workspace de mockups.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mockupIndex.map((m) => {
          const ready = !("status" in m) || m.status !== "planejado";
          return (
            <li key={m.slug}>
              <Link
                href={ready ? `/v6/${m.slug}` : "#"}
                aria-disabled={!ready}
                tabIndex={ready ? 0 : -1}
                className={cn(
                  "block rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 transition-colors",
                  ready
                    ? "hover:border-[var(--accent-primary)] hover:bg-[var(--surface-raised)]"
                    : "cursor-not-allowed opacity-50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {m.name}
                  </span>
                  {"status" in m && m.status === "planejado" ? (
                    <span className="rounded-full border border-[var(--border-default)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      planejado
                    </span>
                  ) : (
                    <span className="rounded-full border border-[var(--accent-primary-subtle)] bg-[var(--accent-primary-subtle)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--accent-primary-text)]">
                      live
                    </span>
                  )}
                </div>
                <div className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
                  /v6/{m.slug}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

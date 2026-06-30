import Image from "next/image";
import type { AuthV6BrandingLabels } from "./auth-v6-types";

export default function AuthV6BrandingPanel({ labels }: { labels: AuthV6BrandingLabels }) {
  return (
    <aside className="hidden flex-col justify-between rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-8 lg:flex lg:min-h-[560px] lg:w-[min(420px,38vw)]">
      <div className="space-y-8">
        <Image
          src="/images/logo.svg"
          alt="ADScale"
          className="h-7 w-auto object-contain opacity-80"
          width={813}
          height={142}
          priority
          unoptimized
        />
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            {labels.sectionLabel}
          </p>
          <h1 className="product-page-title text-[var(--text-primary)]">{labels.title}</h1>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{labels.subtitle}</p>
        </div>
      </div>

      <ul className="space-y-4">
        {labels.features.map((feature) => (
          <li
            key={feature.title}
            className="rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4"
          >
            <p className="text-sm font-semibold text-[var(--text-primary)]">{feature.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{feature.body}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

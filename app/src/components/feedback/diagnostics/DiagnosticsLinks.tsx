"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { DiagnosticLink } from "@/lib/diagnostics/types";
import { ownerButtonClass } from "@/components/feedback/owner-chrome";

const DESTINATION_LABELS: Record<DiagnosticLink["destination"], string> = {
  sentry: "Sentry",
  inngest: "Inngest",
  langfuse: "Langfuse",
};

/**
 * Private vendor deep-links. Anchors render only when the server reports
 * the link as `configured` with a non-null URL; every other state renders
 * as plain text so no half-valid or credential-bearing URL is ever shown.
 */
export function DiagnosticsLinks({ links }: { links: DiagnosticLink[] }) {
  const t = useTranslations("feedback.triage.diagnostics.links");
  return (
    <ul className="space-y-1 text-sm">
      {links.map((link) => {
        const label = DESTINATION_LABELS[link.destination] ?? link.destination;
        if (link.availability === "configured" && link.url) {
          return (
            <li key={link.destination}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--selection-text)] hover:underline"
              >
                {t("open", { destination: label })}
              </a>
            </li>
          );
        }
        return (
          <li
            key={link.destination}
            className="text-[var(--text-muted)]"
            data-testid={`diagnostics-link-${link.destination}-${link.availability}`}
          >
            {label} · {t(link.availability)}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Copies only the opaque support identifier (work/operation id) — never
 * any payload — to the clipboard.
 */
export function SupportCodeButton({ value }: { value: string }) {
  const t = useTranslations("feedback.triage.diagnostics.links");
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={ownerButtonClass}
      data-testid="support-code-copy"
      onClick={() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        })();
      }}
    >
      {copied ? t("copied") : t("copySupportCode")}
    </Button>
  );
}

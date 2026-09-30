"use client";

import { useTranslations } from "next-intl";
import { diagnosisContentSchema, type DiagnosisContent } from "@/server/equipe/handoff/diagnosis-contract";

/** Defensive parse: a stored document is JSON at this boundary. */
export function parseDiagnosisContent(value: unknown): DiagnosisContent | null {
  const parsed = diagnosisContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const originLabel = (t: ReturnType<typeof useTranslations>, origin: string) => origin === "instagram" ? t("fromInstagram") : t("fromSite");

/** The immutable diagnosis, readable: summary, what each source says, opportunities, gaps and the excerpts behind them. */
export default function DiagnosisDocument({ content }: { content: DiagnosisContent }) {
  const t = useTranslations("assistant.equipe.diagnosis");
  const supports = (value: string) => value === "summary" ? t("supportsSummary")
    : value.startsWith("channel:") ? `${t("supportsChannel")} · ${originLabel(t, value.slice(8))}`
      : /^opportunity:\d+$/.test(value) ? t("supportsOpportunity", { n: Number(value.slice(12)) }) : value;
  return (
    <div className="space-y-5 text-sm leading-relaxed" data-testid="diagnosis-document">
      <section>
        <h3 className="mb-1 font-semibold">{t("documentSummary")}</h3>
        <p className="whitespace-pre-wrap break-words">{content.summary}</p>
      </section>
      {content.channels.length ? <section>
        <h3 className="mb-1 font-semibold">{t("documentChannels")}</h3>
        <ul className="space-y-1">{content.channels.map(channel => <li key={channel.source}><span className="text-[var(--text-muted)]">{originLabel(t, channel.source)} · </span>{channel.message}</li>)}</ul>
      </section> : null}
      <section>
        <h3 className="mb-1 font-semibold">{t("documentOpportunities")}</h3>
        {content.opportunities.length
          ? <ol className="list-outside list-decimal space-y-2 pl-5">{content.opportunities.map((opportunity, index) => <li key={index}>{opportunity.title}<span className="ml-2 text-xs text-[var(--text-muted)]">{opportunity.sources.map(source => originLabel(t, source)).join(" · ")}</span></li>)}</ol>
          : <p className="text-[var(--text-muted)]">{t("noOpportunities")}</p>}
      </section>
      {content.notFound.length ? <section>
        <h3 className="mb-1 font-semibold">{t("documentNotFound")}</h3>
        <ul className="list-outside list-disc space-y-1 pl-5">{content.notFound.map(item => <li key={item}>{item}</li>)}</ul>
      </section> : null}
      {content.sources.length ? <section>
        <h3 className="mb-1 font-semibold">{t("documentSources")}</h3>
        <ul className="space-y-2">{content.sources.map((source, index) => <li key={index} className="rounded-xl bg-[var(--surface-raised)] px-3 py-2">
          <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{originLabel(t, source.origin)} · {supports(source.supports)}</p>
          <p className="break-words">“{source.quote}”</p>
        </li>)}</ul>
      </section> : null}
    </div>
  );
}

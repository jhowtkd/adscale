"use client";

import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { diagnosisContentSchema, type DiagnosisContent } from "@/server/equipe/handoff/diagnosis-contract";

/** Defensive parse: a stored document is JSON at this boundary. */
export function parseDiagnosisContent(value: unknown): DiagnosisContent | null {
  const parsed = diagnosisContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const originLabel = (t: ReturnType<typeof useTranslations>, origin: string) => origin === "instagram" ? t("fromInstagram") : t("fromSite");

/** Where a source can be opened: the address and what the link says (the site's host, the profile's @). */
export type DiagnosisSourceLink = { href: string; label: string };
export type DiagnosisSourceLinks = Partial<Record<"site" | "instagram", DiagnosisSourceLink>>;

/** The color each source has on the diagnosis card (its dot): the bar of its quotes takes it, and the title says it in words. */
const ORIGIN_COLOR: Record<string, string> = { site: "var(--warning-dot)", instagram: "var(--info-dot)" };
/** Only a web address is ever opened from here. */
const isWebAddress = (href: string) => { try { return ["http:", "https:"].includes(new URL(href).protocol); } catch { return false; } };

/**
 * The excerpts behind the diagnosis, as what they are: quotations from what is public. Each one sits under a title that says whose words they are ("O que está
 * escrito no seu site" / "no seu Instagram"), with the link to that source when there is one, so a line that is on the site (a "Lorem ipsum", a slogan) is never
 * taken for something the AI wrote. Nothing is hidden, filtered or reworded. A source other than those two (the person's own words) gets no such title.
 */
function Quotes({ sources, links, supports }: { sources: DiagnosisContent["sources"]; links?: DiagnosisSourceLinks; supports: (value: string) => string }) {
  const t = useTranslations("assistant.equipe.diagnosis");
  const groups = [...new Set(sources.map(source => source.origin))].map(origin => ({ origin: origin as string, items: sources.filter(source => source.origin === origin) }));
  return (
    <section data-testid="diagnosis-quotes">
      <h3 className="mb-1 font-semibold">{t("documentSources")}</h3>
      <p className="mb-3 text-xs text-[var(--text-muted)]">{t("quotesNote")}</p>
      <div className="space-y-5">
        {groups.map(group => {
          const quoted = group.origin === "site" || group.origin === "instagram";
          const link = quoted ? links?.[group.origin as "site" | "instagram"] : undefined;
          const linked = link && isWebAddress(link.href) ? link : undefined;
          return (
            <div key={group.origin} data-testid={`diagnosis-quotes-${group.origin}`}>
              {quoted ? (
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h4 className="font-medium">{t(group.origin === "instagram" ? "quotesFromInstagram" : "quotesFromSite")}</h4>
                  {linked ? (
                    <a href={linked.href} target="_blank" rel="noopener noreferrer" aria-label={t("quoteLink", { name: linked.label })}
                      className="inline-flex max-w-full items-center gap-1 break-all text-xs text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
                      {linked.label}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              ) : null}
              <ul className="space-y-2">
                {group.items.map((source, index) => (
                  <li key={index}>
                    <blockquote cite={linked?.href} className="rounded-r-xl border-l-[3px] bg-[var(--surface-raised)] px-3 py-2" style={{ borderLeftColor: ORIGIN_COLOR[group.origin] ?? "var(--text-muted)" }}>
                      <p className="break-words">“{source.quote}”</p>
                      <footer className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{supports(source.supports)}</footer>
                    </blockquote>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The immutable diagnosis, readable: summary, what each source says, opportunities, gaps and the excerpts behind them. */
export default function DiagnosisDocument({ content, sourceLinks }: { content: DiagnosisContent; sourceLinks?: DiagnosisSourceLinks }) {
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
      {content.sources.length ? <Quotes sources={content.sources} links={sourceLinks} supports={supports} /> : null}
    </div>
  );
}

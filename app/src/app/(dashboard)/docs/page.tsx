import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import Panel from "@/components/layout/Panel";
import FeedbackDocsLink from "@/components/feedback/FeedbackDocsLink";

const helpLinks = [
  {
    href: "/campaigns?new=1",
    titleKey: "links.create.title",
    descriptionKey: "links.create.description",
  },
  {
    href: "/templates",
    titleKey: "links.templates.title",
    descriptionKey: "links.templates.description",
  },
  {
    href: "/library",
    titleKey: "links.library.title",
    descriptionKey: "links.library.description",
  },
];

const topicKeys = ["protocols", "references", "contentStyle", "inference", "failures", "approval"] as const;

export default async function DocsPage() {
  const t = await getTranslations("docs");

  return (
    <PageFrame>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="space-y-6">
        <Panel>
        <ul className="divide-y divide-[var(--border-dim)]">
          {helpLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-label={t("openLink", { title: t(link.titleKey) })}
                className="flex items-center justify-between gap-4 px-1 py-4 transition-colors hover:text-[var(--active-navigation-text)]"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium text-[var(--text-primary)]">{t(link.titleKey)}</span>
                  <span className="text-sm text-[var(--text-muted)]">{t(link.descriptionKey)}</span>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-[var(--utility-icon)]" />
              </Link>
            </li>
          ))}
          <li>
            <FeedbackDocsLink
              title={t("links.feedback.title")}
              description={t("links.feedback.description")}
              ariaLabel={t("openLink", { title: t("links.feedback.title") })}
            />
          </li>
        </ul>
        </Panel>
        <section aria-labelledby="docs-topics" className="space-y-3">
          <h2 id="docs-topics" className="text-base font-semibold text-[var(--text-primary)]">{t("topicsTitle")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {topicKeys.map((key) => (
              <article key={key} className="rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t(`topics.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{t(`topics.${key}.body`)}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

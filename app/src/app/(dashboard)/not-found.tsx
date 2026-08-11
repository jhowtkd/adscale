import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function DashboardNotFound() {
  const t = await getTranslations("dashboardNotFound");

  return (
    <section className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{t("title")}</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("body")}</p>
      <Link href="/campaigns" className="mt-6 inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 text-sm font-medium text-[var(--action-primary-text)]">
        {t("action")}
      </Link>
    </section>
  );
}

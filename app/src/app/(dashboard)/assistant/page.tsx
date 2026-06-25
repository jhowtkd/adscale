import { getTranslations } from "next-intl/server";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ threadId?: string }>;
}) {
  const { threadId } = await searchParams;
  const t = await getTranslations("assistant.empty");

  if (!threadId) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center p-6 text-center">
        <p className="max-w-md text-sm text-[var(--text-muted)]">{t("selectThread")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[50vh] flex-col p-6">
      <p className="text-sm text-[var(--text-secondary)]">
        Thread: <span className="font-mono text-[var(--text-primary)]">{threadId}</span>
      </p>
      <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border-dim)] text-sm text-[var(--text-muted)]">
        Chat placeholder
      </div>
    </div>
  );
}

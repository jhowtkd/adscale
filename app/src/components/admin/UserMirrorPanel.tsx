"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import type { AdminUserMirror } from "@/server/repositories/admin-users";

type UserMirrorPanelProps = {
  userId: string;
};

export default function UserMirrorPanel({ userId }: UserMirrorPanelProps) {
  const t = useTranslations("admin.users.mirror");

  const mirrorQuery = useQuery({
    queryKey: ["admin", "users", userId, "mirror"],
    queryFn: async (): Promise<AdminUserMirror> => {
      const res = await apiFetch(`/api/admin/users/${userId}/mirror`);
      if (!res.ok) {
        throw new Error("Failed to load user mirror");
      }
      return res.json();
    },
  });

  if (mirrorQuery.isLoading) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>;
  }

  if (mirrorQuery.isError || !mirrorQuery.data) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("error")}</p>;
  }

  const mirror = mirrorQuery.data;

  return (
    <aside className="space-y-4">
      <div
        role="status"
        className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-medium text-amber-200"
      >
        {t("banner")}
      </div>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("user.title")}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-[var(--text-muted)]">{t("user.name")}</dt>
            <dd className="text-[var(--text-primary)]">{mirror.user.name}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("user.email")}</dt>
            <dd className="text-[var(--text-primary)]">{mirror.user.email}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("workspace.title")}
        </h2>
        {mirror.workspace.id ? (
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-[var(--text-muted)]">{t("workspace.name")}</dt>
              <dd className="text-[var(--text-primary)]">{mirror.workspace.name}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">{t("workspace.credits")}</dt>
              <dd className="text-[var(--text-primary)]">{mirror.workspace.creditBalance}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">{t("workspace.remainingAds")}</dt>
              <dd className="text-[var(--text-primary)]">
                {mirror.workspace.remainingAds ?? "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("workspace.empty")}</p>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("campaigns.title")}
        </h2>
        {mirror.recentCampaigns.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("campaigns.empty")}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {mirror.recentCampaigns.map((campaign) => (
              <li
                key={campaign.id}
                className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-3"
              >
                <span
                  aria-disabled="true"
                  className="block font-medium text-[var(--text-primary)]"
                >
                  {campaign.name}
                </span>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
                  <span>{t("campaigns.status", { status: campaign.status })}</span>
                  <span>
                    {t("campaigns.derivations", { count: campaign.derivationCount })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

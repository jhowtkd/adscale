"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUserDetail } from "@/server/repositories/admin-users";

type UserDetailPanelProps = {
  userId: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function UserDetailPanel({ userId }: UserDetailPanelProps) {
  const t = useTranslations("admin.users.detail");

  const detailQuery = useQuery({
    queryKey: ["admin", "users", userId, "detail"],
    queryFn: async (): Promise<AdminUserDetail> => {
      const res = await apiFetch(`/api/admin/users/${userId}`);
      if (!res.ok) {
        throw new Error("Failed to load user detail");
      }
      return res.json();
    },
  });

  if (detailQuery.isLoading) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("loading")}</p>;
  }

  if (detailQuery.isError || !detailQuery.data) {
    return <p className="text-sm text-[var(--text-secondary)]">{t("error")}</p>;
  }

  const detail = detailQuery.data;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("profile.title")}</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--text-muted)]">{t("profile.name")}</dt>
            <dd className="font-medium text-[var(--text-primary)]">{detail.profile.name}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("profile.email")}</dt>
            <dd className="text-[var(--text-primary)]">{detail.profile.email}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("profile.locale")}</dt>
            <dd className="text-[var(--text-primary)]">{detail.profile.locale}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("profile.verified")}</dt>
            <dd className="text-[var(--text-primary)]">
              {detail.profile.emailVerified ? t("profile.yes") : t("profile.no")}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("profile.onboarding")}</dt>
            <dd className="text-[var(--text-primary)]">
              {detail.profile.onboardingCompleted ? t("profile.complete") : t("profile.incomplete")}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("profile.lastSession")}</dt>
            <dd className="text-[var(--text-primary)]">{formatDate(detail.lastSessionAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">{t("profile.created")}</dt>
            <dd className="text-[var(--text-primary)]">{formatDate(detail.profile.createdAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("workspaces.title")}
        </h2>
        {detail.workspaces.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("workspaces.empty")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("workspaces.columns.name")}</TableHead>
                <TableHead>{t("workspaces.columns.role")}</TableHead>
                <TableHead>{t("workspaces.columns.plan")}</TableHead>
                <TableHead>{t("workspaces.columns.credits")}</TableHead>
                <TableHead>{t("workspaces.columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.workspaces.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell>
                    <Link
                      href={`/admin/workspaces/${workspace.id}`}
                      className="text-[var(--accent-green)] hover:underline"
                    >
                      {workspace.name}
                    </Link>
                  </TableCell>
                  <TableCell>{workspace.role}</TableCell>
                  <TableCell>{workspace.billing.planKey ?? "—"}</TableCell>
                  <TableCell>{workspace.billing.creditBalance}</TableCell>
                  <TableCell>{workspace.billing.label}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("campaigns.title")}
        </h2>
        {detail.recentCampaigns.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("campaigns.empty")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("campaigns.columns.name")}</TableHead>
                <TableHead>{t("campaigns.columns.status")}</TableHead>
                <TableHead>{t("campaigns.columns.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.recentCampaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>{campaign.name}</TableCell>
                  <TableCell>{campaign.status}</TableCell>
                  <TableCell>{formatDate(campaign.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          {t("derivations.title")}
        </h2>
        {detail.recentDerivations.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">{t("derivations.empty")}</p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>{t("derivations.columns.campaign")}</TableHead>
                <TableHead>{t("derivations.columns.status")}</TableHead>
                <TableHead>{t("derivations.columns.format")}</TableHead>
                <TableHead>{t("derivations.columns.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.recentDerivations.map((derivation) => (
                <TableRow key={derivation.id}>
                  <TableCell>{derivation.campaignName}</TableCell>
                  <TableCell>{derivation.status}</TableCell>
                  <TableCell>{derivation.format ?? "—"}</TableCell>
                  <TableCell>{formatDate(derivation.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

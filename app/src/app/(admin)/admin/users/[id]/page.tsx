"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import UserDetailPanel from "@/components/admin/UserDetailPanel";
import UserActionsPanel from "@/components/admin/UserActionsPanel";
import UserMirrorPanel from "@/components/admin/UserMirrorPanel";

type AdminUserDetailPageProps = {
  params: { id: string };
};

export default function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const t = useTranslations("admin.users.detail");

  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <div className="space-y-2">
        <Link
          href="/admin/users"
          className="text-sm text-[var(--accent-green)] hover:underline"
        >
          {t("backToList")}
        </Link>
        <PageHeader title={t("title")} description={t("description")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <UserDetailPanel userId={params.id} />
          <UserActionsPanel userId={params.id} />
        </div>
        <UserMirrorPanel userId={params.id} />
      </div>
    </PageFrame>
  );
}

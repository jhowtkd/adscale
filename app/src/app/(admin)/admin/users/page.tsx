"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import UserListTable from "@/components/admin/UserListTable";

function UsersListContent() {
  const t = useTranslations("admin.users");

  return (
    <PageFrame width="operational" className="space-y-6 py-8">
      <PageHeader title={t("title")} description={t("description")} />
      <UserListTable />
    </PageFrame>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersListContent />
    </Suspense>
  );
}

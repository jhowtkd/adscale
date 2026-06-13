"use client";

import { Suspense } from "react";
import { m } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import ProfileTab from "@/components/settings/ProfileTab";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import ResponsiveTabs from "@/components/layout/ResponsiveTabs";
import SettingsTabSkeleton from "@/components/settings/SettingsTabSkeleton";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const WorkspaceTab = dynamic(() => import("@/components/settings/WorkspaceTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const TeamTab = dynamic(() => import("@/components/settings/TeamTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const BrandKitTab = dynamic(() => import("@/components/settings/BrandKitTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const BillingTab = dynamic(() => import("@/components/settings/BillingTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const CreditHistoryTab = dynamic(() => import("@/components/settings/CreditHistoryTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const PlansTab = dynamic(() => import("@/components/settings/PlansTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const IntegrationsTab = dynamic(() => import("@/components/settings/IntegrationsTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const PrivacyTab = dynamic(() => import("@/components/settings/PrivacyTab"), {
  loading: () => <SettingsTabSkeleton />,
});

const tabs = [
  { id: "profile", labelKey: "profileTab" },
  { id: "workspace", labelKey: "workspaceTab" },
  { id: "brandKit", labelKey: "brandKitTab" },
  { id: "team", labelKey: "teamTab" },
  { id: "billing", labelKey: "billingTab" },
  { id: "creditHistory", labelKey: "creditHistoryTab" },
  { id: "plans", labelKey: "plansTab" },
  { id: "integrations", labelKey: "integrationsTab" },
  { id: "privacy", labelKey: "privacyTab" },
];

const tabIds = tabs.map((tab) => tab.id);

const tabVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsTabSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("settings");
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab && tabIds.includes(requestedTab) ? requestedTab : "profile";

  return (
    <PageFrame width="operational" className="space-y-6">
      <PageHeader title={t("title")} description={t("managePreferences")} />

      <ResponsiveTabs
        ariaLabel={t("title")}
        activeId={activeTab}
        onSelect={(id) => router.replace(`/settings?tab=${id}`, { scroll: false })}
        items={tabs.map((tab) => ({
          id: tab.id,
          label: t(tab.labelKey),
          badge:
            tab.id === "integrations" ? (
              <Badge variant="secondary">Setup</Badge>
            ) : undefined,
        }))}
      />

      <m.div
        key={activeTab}
        variants={tabVariants}
        initial="hidden"
        animate="visible"
      >
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "workspace" && <WorkspaceTab />}
        {activeTab === "brandKit" && <BrandKitTab />}
        {activeTab === "team" && <TeamTab />}
        {activeTab === "billing" && <BillingTab />}
        {activeTab === "creditHistory" && <CreditHistoryTab />}
        {activeTab === "plans" && <PlansTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "privacy" && <PrivacyTab />}
      </m.div>
    </PageFrame>
  );
}

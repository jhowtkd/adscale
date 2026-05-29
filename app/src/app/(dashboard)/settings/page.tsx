"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import ProfileTab from "@/components/settings/ProfileTab";
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

function SettingsTabSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border p-6 animate-pulse">
      <div className="h-6 bg-muted rounded w-1/3" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 bg-muted rounded w-24" />
            <div className="h-10 bg-muted rounded w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("settings");
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab && tabIds.includes(requestedTab) ? requestedTab : "profile";

  useEffect(() => {
    setCurrentPageTitle(t("title"));
  }, [setCurrentPageTitle, t]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {t("managePreferences")}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border-dim)]">
        <nav className="flex gap-1 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => router.replace(`/settings?tab=${tab.id}`, { scroll: false })}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors duration-200",
                activeTab === tab.id
                  ? "text-[var(--accent-green)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <span className="flex items-center gap-2">
                {t(tab.labelKey)}
                {tab.id === "integrations" && <Badge variant="secondary">Setup</Badge>}
              </span>
              {activeTab === tab.id && (
                <motion.div
                  layoutId="settings-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-green)]"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <motion.div
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
      </motion.div>
    </div>
  );
}

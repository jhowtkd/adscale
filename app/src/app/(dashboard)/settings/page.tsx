"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import ProfileTab from "@/components/settings/ProfileTab";
import WorkspaceTab from "@/components/settings/WorkspaceTab";
import TeamTab from "@/components/settings/TeamTab";
import BillingTab from "@/components/settings/BillingTab";
import PlansTab from "@/components/settings/PlansTab";
import IntegrationsTab from "@/components/settings/IntegrationsTab";
import PrivacyTab from "@/components/settings/PrivacyTab";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const tabs = [
  { id: "profile", labelKey: "profileTab" },
  { id: "workspace", labelKey: "workspaceTab" },
  { id: "team", labelKey: "teamTab" },
  { id: "billing", labelKey: "billingTab" },
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
                  ? "text-[var(--accent-mint)]"
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
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent-mint)]"
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
        {activeTab === "team" && <TeamTab />}
        {activeTab === "billing" && <BillingTab />}
        {activeTab === "plans" && <PlansTab />}
        {activeTab === "integrations" && <IntegrationsTab />}
        {activeTab === "privacy" && <PrivacyTab />}
      </motion.div>
    </div>
  );
}

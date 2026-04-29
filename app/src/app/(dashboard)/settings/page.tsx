"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import ProfileTab from "@/components/settings/ProfileTab";
import WorkspaceTab from "@/components/settings/WorkspaceTab";
import TeamTab from "@/components/settings/TeamTab";
import BillingTab from "@/components/settings/BillingTab";
import IntegrationsTab from "@/components/settings/IntegrationsTab";
import { useTranslations } from "next-intl";

const tabs = [
  { id: "profile", labelKey: "profileTab" },
  { id: "workspace", labelKey: "workspaceTab" },
  { id: "team", labelKey: "teamTab" },
  { id: "billing", labelKey: "billingTab" },
  { id: "integrations", labelKey: "integrationsTab" },
];

const tabVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SettingsPage() {
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);
  const [activeTab, setActiveTab] = useState("profile");
  const t = useTranslations("settings");

  useEffect(() => {
    setCurrentPageTitle(t("title"));
  }, [setCurrentPageTitle, t]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium transition-colors duration-200",
                activeTab === tab.id
                  ? "text-[var(--accent-mint)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {t(tab.labelKey)}
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
        {activeTab === "integrations" && <IntegrationsTab />}
      </motion.div>
    </div>
  );
}

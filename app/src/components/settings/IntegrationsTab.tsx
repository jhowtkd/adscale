"use client";

import { m, useReducedMotion } from "@/components/animations/MotionBoundary";
import {
  Search,
  Music,
  MessageSquare,
  Webhook,
  Key,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  settingsButtonClass,
  settingsDangerButtonClass,
  settingsHintClass,
  settingsRowClass,
} from "@/components/settings/settings-chrome";
import { McpTokensCard } from "@/components/settings/McpTokensCard";
import { MetaConnectionCard } from "@/components/settings/MetaConnectionCard";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.35 } },
};

// ============================================
// Integrations Tab
// ============================================

type IntegrationStatus = "connected" | "not_connected" | "error";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: IntegrationStatus;
  iconBg: string;
  iconColor: string;
}

const integrations: Integration[] = [
  {
    id: "google",
    name: "Google Ads",
    description: "Push creatives to Google Ads campaigns",
    icon: <Search size={22} />,
    status: "not_connected",
    iconBg: "var(--neutral-bg)",
    iconColor: "var(--utility-icon)",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Upload variations to TikTok Ad Library",
    icon: <Music size={22} />,
    status: "not_connected",
    iconBg: "var(--neutral-bg)",
    iconColor: "var(--utility-icon)",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Get generation notifications in Slack",
    icon: <MessageSquare size={22} />,
    status: "not_connected",
    iconBg: "var(--neutral-bg)",
    iconColor: "var(--utility-icon)",
  },
  {
    id: "webhook",
    name: "Webhook",
    description: "Send events to your custom endpoint",
    icon: <Webhook size={22} />,
    status: "not_connected",
    iconBg: "var(--neutral-bg)",
    iconColor: "var(--utility-icon)",
  },
  {
    id: "api",
    name: "API Access",
    description: "Generate API keys for programmatic access",
    icon: <Key size={22} />,
    status: "connected",
    iconBg: "var(--neutral-bg)",
    iconColor: "var(--utility-icon)",
  },
];

const statusConfig: Record<
  IntegrationStatus,
  { label: string; color: string }
> = {
  connected: { label: "Connected", color: "var(--success-text)" },
  not_connected: { label: "Not connected", color: "var(--text-muted)" },
  error: { label: "Error", color: "var(--danger-text)" },
};

const statusKeyMap: Record<IntegrationStatus, string> = {
  connected: "connected",
  not_connected: "notConnected",
  error: "error",
};

const nameKeyMap: Record<string, string> = {
  google: "googleAds",
  tiktok: "tiktokAds",
  slack: "slack",
  webhook: "webhook",
  api: "apiAccess",
};

const descKeyMap: Record<string, string> = {
  google: "googleAdsDesc",
  tiktok: "tiktokAdsDesc",
  slack: "slackDesc",
  webhook: "webhookDesc",
  api: "apiAccessDesc",
};

export default function IntegrationsTab() {
  const addToast = useAppStore((s) => s.addToast);
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const reducedMotion = useReducedMotion();
  const [integrationStates, setIntegrationStates] = useState<
    Record<string, IntegrationStatus>
  >(
    Object.fromEntries(
      integrations.map((i) => [i.id, i.status])
    ) as Record<string, IntegrationStatus>
  );

  const handleConnect = (id: string) => {
    const current = integrationStates[id];
    const name = t(nameKeyMap[id]);
    if (current === "connected") {
      setIntegrationStates((prev) => ({ ...prev, [id]: "not_connected" }));
      addToast("info", tc("disconnected", { name }));
    } else {
      setIntegrationStates((prev) => ({ ...prev, [id]: "connected" }));
      addToast(
        "success",
        tc("connected", { name })
      );
    }
  };

  return (
    <m.div
      variants={containerVariants}
      initial={reducedMotion ? false : "hidden"}
      animate="show"
      className="max-w-[720px]"
    >
      <McpTokensCard />
      <MetaConnectionCard />
      <div>
        {integrations.map((integration) => {
          const status = integrationStates[integration.id];
          const config = statusConfig[status];
          const isConnected = status === "connected";

          return (
            <m.div
              key={integration.id}
              variants={itemVariants}
              className={settingsRowClass}
            >
              <div
                className="flex size-9 shrink-0 items-center justify-center rounded-md"
                style={{
                  backgroundColor: integration.iconBg,
                  color: integration.iconColor,
                }}
              >
                {integration.icon}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">
                    {t(nameKeyMap[integration.id])}
                  </h4>
                  <span className={settingsHintClass} style={{ color: config.color }}>
                    {t(`integrations.${statusKeyMap[status]}`)}
                  </span>
                </div>
                <p className={cn(settingsHintClass, "mt-0.5")}>
                  {t(descKeyMap[integration.id])}
                </p>
              </div>

              <div className="shrink-0">
                {integration.id === "api" ? (
                  <button
                    type="button"
                    onClick={() => addToast("info", tc("apiKeyManagementComingSoon"))}
                    className={settingsButtonClass}
                  >
                    {t("config")}
                  </button>
                ) : isConnected ? (
                  <button
                    type="button"
                    onClick={() => handleConnect(integration.id)}
                    className={settingsDangerButtonClass}
                  >
                    {t("disconnect")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(integration.id)}
                    className={settingsButtonClass}
                  >
                    {t("connect")}
                  </button>
                )}
              </div>
            </m.div>
          );
        })}
      </div>
    </m.div>
  );
}

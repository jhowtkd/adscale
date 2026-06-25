"use client";

import { m } from "framer-motion";
import {
  Megaphone,
  Search,
  Music,
  MessageSquare,
  Webhook,
  Key,
  ExternalLink,
  Settings,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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
    id: "meta",
    name: "Meta Ads",
    description: "Export derivations directly to Meta Ads Manager",
    icon: <Megaphone size={22} />,
    status: "not_connected",
    iconBg: "var(--accent-green-dim)",
    iconColor: "var(--accent-green)",
  },
  {
    id: "google",
    name: "Google Ads",
    description: "Push creatives to Google Ads campaigns",
    icon: <Search size={22} />,
    status: "not_connected",
    iconBg: "var(--accent-green-dim)",
    iconColor: "var(--accent-green)",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Upload variations to TikTok Ad Library",
    icon: <Music size={22} />,
    status: "not_connected",
    iconBg: "rgba(225,29,72,0.12)",
    iconColor: "var(--accent-rose)",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Get generation notifications in Slack",
    icon: <MessageSquare size={22} />,
    status: "not_connected",
    iconBg: "var(--accent-green-dim)",
    iconColor: "var(--accent-green)",
  },
  {
    id: "webhook",
    name: "Webhook",
    description: "Send events to your custom endpoint",
    icon: <Webhook size={22} />,
    status: "not_connected",
    iconBg: "rgba(212,160,23,0.12)",
    iconColor: "var(--accent-amber)",
  },
  {
    id: "api",
    name: "API Access",
    description: "Generate API keys for programmatic access",
    icon: <Key size={22} />,
    status: "connected",
    iconBg: "var(--accent-green-dim)",
    iconColor: "var(--accent-green)",
  },
];

const statusConfig: Record<
  IntegrationStatus,
  { label: string; color: string }
> = {
  connected: { label: "Connected", color: "var(--accent-teal)" },
  not_connected: { label: "Not connected", color: "var(--text-muted)" },
  error: { label: "Error", color: "var(--accent-rose)" },
};

const statusKeyMap: Record<IntegrationStatus, string> = {
  connected: "connected",
  not_connected: "notConnected",
  error: "error",
};

const nameKeyMap: Record<string, string> = {
  meta: "metaAds",
  google: "googleAds",
  tiktok: "tiktokAds",
  slack: "slack",
  webhook: "webhook",
  api: "apiAccess",
};

const descKeyMap: Record<string, string> = {
  meta: "metaAdsDesc",
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
      initial="hidden"
      animate="show"
      className="max-w-[720px]"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((integration) => {
          const status = integrationStates[integration.id];
          const config = statusConfig[status];
          const isConnected = status === "connected";

          return (
            <m.div
              key={integration.id}
              variants={itemVariants}
              className={cn(
                "rounded-xl p-5 space-y-4",
                "bg-[var(--surface-base)] border transition-all duration-200",
                isConnected
                  ? "border-[var(--accent-teal)]/30"
                  : "border-[var(--border-dim)] hover:border-[var(--border-medium)] hover:-translate-y-0.5"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div
                  className="size-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: integration.iconBg,
                    color: integration.iconColor,
                  }}
                >
                  {integration.icon}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[15px] font-semibold text-[var(--text-primary)]">
                      {t(nameKeyMap[integration.id])}
                    </h4>
                    <span
                      className="text-xs font-medium"
                      style={{ color: config.color }}
                    >
                      {t(`integrations.${statusKeyMap[status]}`)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                    {t(descKeyMap[integration.id])}
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-1">
                {integration.id === "api" ? (
                  <button type="button"
                    onClick={() => addToast("info", tc("apiKeyManagementComingSoon"))}
                    className={cn(
                      "h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5",
                      "bg-[var(--surface-raised)] text-[var(--text-primary)]",
                      "border border-[var(--border-dim)]",
                      "hover:bg-[var(--surface-base)] hover:border-[var(--border-medium)]",
                      "active:scale-[0.98]",
                      "transition-all duration-200"
                    )}
                  >
                    <Settings size={14} />
                    {t("config")}
                  </button>
                ) : isConnected ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleConnect(integration.id)}
                    className="text-[var(--danger-text)] hover:bg-[var(--danger-bg)]"
                  >
                    <Unlink size={14} aria-hidden="true" />
                    {t("disconnect")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleConnect(integration.id)}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                    {t("connect")}
                  </Button>
                )}
              </div>
            </m.div>
          );
        })}
      </div>
    </m.div>
  );
}

"use client";

import { motion } from "framer-motion";
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
    iconBg: "rgba(99,102,241,0.12)",
    iconColor: "#818cf8",
  },
  {
    id: "google",
    name: "Google Ads",
    description: "Push creatives to Google Ads campaigns",
    icon: <Search size={22} />,
    status: "not_connected",
    iconBg: "rgba(20,184,166,0.12)",
    iconColor: "#2dd4bf",
  },
  {
    id: "tiktok",
    name: "TikTok Ads",
    description: "Upload variations to TikTok Ad Library",
    icon: <Music size={22} />,
    status: "not_connected",
    iconBg: "rgba(244,63,94,0.12)",
    iconColor: "#fb7185",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Get generation notifications in Slack",
    icon: <MessageSquare size={22} />,
    status: "not_connected",
    iconBg: "rgba(167,139,250,0.12)",
    iconColor: "#c4b5fd",
  },
  {
    id: "webhook",
    name: "Webhook",
    description: "Send events to your custom endpoint",
    icon: <Webhook size={22} />,
    status: "not_connected",
    iconBg: "rgba(245,158,11,0.12)",
    iconColor: "#fbbf24",
  },
  {
    id: "api",
    name: "API Access",
    description: "Generate API keys for programmatic access",
    icon: <Key size={22} />,
    status: "connected",
    iconBg: "rgba(99,102,241,0.12)",
    iconColor: "#818cf8",
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

export default function IntegrationsTab() {
  const addToast = useAppStore((s) => s.addToast);
  const [integrationStates, setIntegrationStates] = useState<
    Record<string, IntegrationStatus>
  >(
    Object.fromEntries(
      integrations.map((i) => [i.id, i.status])
    ) as Record<string, IntegrationStatus>
  );

  const handleConnect = (id: string) => {
    const current = integrationStates[id];
    if (current === "connected") {
      setIntegrationStates((prev) => ({ ...prev, [id]: "not_connected" }));
      addToast("info", `${integrations.find((i) => i.id === id)?.name} disconnected`);
    } else {
      setIntegrationStates((prev) => ({ ...prev, [id]: "connected" }));
      addToast(
        "success",
        `${integrations.find((i) => i.id === id)?.name} connected`
      );
    }
  };

  return (
    <motion.div
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
            <motion.div
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
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
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
                      {integration.name}
                    </h4>
                    <span
                      className="text-xs font-medium"
                      style={{ color: config.color }}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                    {integration.description}
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-1">
                {integration.id === "api" ? (
                  <button
                    onClick={() => addToast("info", "API key management coming soon")}
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
                    Configure
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(integration.id)}
                    className={cn(
                      "h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5",
                      "transition-all duration-200 active:scale-[0.98]",
                      isConnected
                        ? "text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10"
                        : cn(
                            "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
                          )
                    )}
                  >
                    {isConnected ? (
                      <>
                        <Unlink size={14} />
                        Disconnect
                      </>
                    ) : (
                      <>
                        <ExternalLink size={14} />
                        Connect
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

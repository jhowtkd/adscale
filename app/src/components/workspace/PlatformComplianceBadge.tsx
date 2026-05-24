"use client";

import { ShieldCheck, AlertTriangle, XCircle } from "lucide-react";

interface PlatformComplianceBadgeProps {
  platform: string;
  compliance: "pass" | "warning" | "fail" | string;
  recommendation?: string | null;
}

const complianceConfig = {
  pass: { icon: ShieldCheck, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  warning: { icon: AlertTriangle, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  fail: { icon: XCircle, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
};

export default function PlatformComplianceBadge({
  platform,
  compliance,
  recommendation,
}: PlatformComplianceBadgeProps) {
  const config = complianceConfig[compliance as keyof typeof complianceConfig] ?? complianceConfig.pass;
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${config.color}`}
      title={recommendation ?? undefined}
    >
      <Icon size={10} />
      {platform.replace("_", " ")}
    </span>
  );
}

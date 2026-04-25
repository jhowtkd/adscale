"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  change?: {
    value: string;
    positive?: boolean;
  };
  iconBgColor: string;
  iconColor: string;
  index?: number;
  className?: string;
}

export default function StatsCard({
  icon: Icon,
  label,
  value,
  change,
  iconBgColor,
  iconColor,
  index = 0,
  className,
}: StatsCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: [0.19, 1, 0.22, 1],
      }}
      whileHover={{
        y: -2,
        transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
      }}
      className={cn(
        "group relative rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 transition-all duration-250 cursor-pointer will-change-transform",
        "hover:border-[var(--border-medium)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.2)]",
        className
      )}
    >
      {/* Hover gradient overlay */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[rgba(99,102,241,0.06)] to-[rgba(20,184,166,0.04)] opacity-0 transition-opacity duration-250 group-hover:opacity-100" />

      <div className="relative z-10">
        {/* Icon */}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md mb-3"
          style={{ backgroundColor: iconBgColor }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>

        {/* Label */}
        <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] mb-1">
          {label}
        </p>

        {/* Value */}
        <p className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)] mb-1">
          {value}
        </p>

        {/* Change indicator */}
        {change && (
          <div className="flex items-center gap-1 text-[13px]">
            <span
              className={cn(
                change.positive !== false
                  ? "text-[var(--accent-teal)]"
                  : "text-[var(--accent-amber)]"
              )}
            >
              {change.positive !== false ? "▲" : "▼"} {change.value}
            </span>
            {change.positive !== undefined && (
              <span className="text-[var(--text-muted)] text-xs">vs last month</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

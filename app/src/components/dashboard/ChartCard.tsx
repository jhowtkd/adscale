"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function ChartCard({ title, children, className, delay = 0 }: ChartCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 animate-fade-in",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 font-mono tracking-wide">
        {title}
      </h3>
      <div className="relative">{children}</div>
    </div>
  );
}

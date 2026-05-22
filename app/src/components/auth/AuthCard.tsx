"use client";


import { cn } from "@/lib/utils";

interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
}

export default function AuthCard({ children, className }: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full max-w-[420px] rounded-xl p-8 animate-fade-in",
        "bg-[var(--surface-base)] border border-[var(--border-dim)]",
        "shadow-[0_8px_32px_rgba(0,0,0,0.06)]",
        "relative overflow-hidden",
        className
      )}
      style={{ animationDelay: "200ms" }}
    >
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

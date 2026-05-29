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
        "glass-card",
        "relative overflow-hidden",
        className
      )}
      style={{ animationDelay: "200ms" }}
    >
      {/* Ambient glow */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-[var(--accent-green)]/5 rounded-full blur-[60px] pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-[var(--accent-green)]/3 rounded-full blur-[60px] pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

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
        "w-full animate-fade-in rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.45)] sm:p-8",
        className,
      )}
      style={{ animationDelay: "120ms" }}
    >
      {children}
    </div>
  );
}

"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribeMounted() {
  return () => {};
}

function getMountedSnapshot() {
  return true;
}

function getServerMountedSnapshot() {
  return false;
}

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getServerMountedSnapshot
  );

  if (!mounted) {
    return (
      <div className={cn("size-9 rounded-full bg-[var(--surface-raised)] animate-pulse", className)} />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative flex items-center justify-center size-9 rounded-full",
        "bg-[var(--surface-raised)] text-[var(--text-secondary)]",
        "hover:text-[var(--accent-green)] hover:bg-[var(--accent-green)]/10",
        "transition-all duration-300 ease-out",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] focus-visible:ring-offset-2",
        className
      )}
      aria-label={isDark ? "Mudar para light mode" : "Mudar para dark mode"}
    >
      <div className="relative size-4">
        <Sun
          size={16}
          className={cn(
            "absolute inset-0 transition-all duration-300",
            isDark ? "opacity-0 rotate-90 scale-0" : "opacity-100 rotate-0 scale-100"
          )}
        />
        <Moon
          size={16}
          className={cn(
            "absolute inset-0 transition-all duration-300",
            isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-0"
          )}
        />
      </div>
    </button>
  );
}

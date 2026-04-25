"use client";

import { useAppStore } from "@/lib/store";
import { useEffect } from "react";

export default function SettingsPage() {
  const setCurrentPageTitle = useAppStore((s) => s.setCurrentPageTitle);

  useEffect(() => {
    setCurrentPageTitle("Settings");
  }, [setCurrentPageTitle]);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
        Settings
      </h1>
      <p className="mt-2 text-[var(--text-secondary)]">
        Manage your profile, workspace, and preferences.
      </p>
    </div>
  );
}

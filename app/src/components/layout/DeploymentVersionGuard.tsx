"use client";

import { useEffect } from "react";

const STORAGE_KEY = "adscale_build_id";

export default function DeploymentVersionGuard() {
  useEffect(() => {
    let cancelled = false;

    async function checkBuildId() {
      try {
        const response = await fetch("/api/build-id", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { buildId?: string };
        const buildId = data.buildId ?? "unknown";
        if (cancelled) return;

        const previous = sessionStorage.getItem(STORAGE_KEY);
        if (!previous) {
          sessionStorage.setItem(STORAGE_KEY, buildId);
          return;
        }

        if (previous !== buildId) {
          sessionStorage.setItem(STORAGE_KEY, buildId);
          window.location.reload();
        }
      } catch {
        // Ignore network errors; guard is best-effort.
      }
    }

    void checkBuildId();
    const interval = window.setInterval(checkBuildId, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

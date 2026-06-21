"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createContext, useContext, useCallback, useState, type ReactNode } from "react";

export type CorpusScope = "global" | "workspace";

type QualityContextValue = {
  scope: CorpusScope;
  workspaceId: string;
  cohort: string;
  setScope: (scope: CorpusScope) => void;
  setWorkspaceId: (id: string) => void;
  setCohort: (cohort: string) => void;
};

const QualityContext = createContext<QualityContextValue | null>(null);

export function QualityProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const scope = (searchParams.get("scope") as CorpusScope) || "global";
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const cohort = searchParams.get("cohort") ?? "";

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const value: QualityContextValue = {
    scope,
    workspaceId,
    cohort,
    setScope: (s) => updateParams({ scope: s, workspaceId: s === "global" ? null : workspaceId }),
    setWorkspaceId: (id) => updateParams({ workspaceId: id || null }),
    setCohort: (c) => updateParams({ cohort: c || null }),
  };

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

/** Local state provider for embedded HumanQualityCorpusPanel (no URL sync). */
export function LocalQualityProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<CorpusScope>("global");
  const [workspaceId, setWorkspaceIdState] = useState("");
  const [cohort, setCohortState] = useState("");

  const value: QualityContextValue = {
    scope,
    workspaceId,
    cohort,
    setScope: (s) => {
      setScopeState(s);
      if (s === "global") setWorkspaceIdState("");
    },
    setWorkspaceId: setWorkspaceIdState,
    setCohort: setCohortState,
  };

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

export function useQualityContext() {
  const ctx = useContext(QualityContext);
  if (!ctx) throw new Error("useQualityContext requires QualityProvider");
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// What the conversation surfaces share: the version comparison dialog. The rail shell (V6ShellLayout) mounts the
// provider; AssistantChatCore reads it and hands openVersionComparison down to the message list.
interface AssistantSurfaceActions {
  versionComparisonRequest: VersionComparisonRequest | null;
  versionComparisonTrigger: HTMLElement | null;
  openVersionComparison: (request: VersionComparisonRequest) => void;
  closeVersionComparison: () => void;
}

export interface VersionComparisonRequest {
  threadId: string;
  lineageId: string;
  artifactType: "plan" | "creative";
  versionAId: string;
  versionBId: string;
}

const AssistantSurfaceContext = createContext<AssistantSurfaceActions | null>(
  null
);

export function AssistantSurfaceProvider({ children }: { children: ReactNode }) {
  const [versionComparisonRequest, setVersionComparisonRequest] =
    useState<VersionComparisonRequest | null>(null);
  const [versionComparisonTrigger, setVersionComparisonTrigger] =
    useState<HTMLElement | null>(null);

  const openVersionComparison = useCallback(
    (request: VersionComparisonRequest) => {
      setVersionComparisonTrigger(
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      );
      setVersionComparisonRequest(request);
    },
    []
  );

  const closeVersionComparison = useCallback(
    () => {
      setVersionComparisonRequest(null);
      setVersionComparisonTrigger(null);
    },
    []
  );

  const value = useMemo(
    () => ({
      versionComparisonRequest,
      versionComparisonTrigger,
      openVersionComparison,
      closeVersionComparison,
    }),
    [
      versionComparisonRequest,
      versionComparisonTrigger,
      openVersionComparison,
      closeVersionComparison,
    ]
  );

  return (
    <AssistantSurfaceContext.Provider value={value}>
      {children}
    </AssistantSurfaceContext.Provider>
  );
}

export function useAssistantSurface() {
  const context = useContext(AssistantSurfaceContext);
  if (!context) {
    throw new Error("useAssistantSurface must be used within AssistantSurfaceProvider");
  }
  return context;
}

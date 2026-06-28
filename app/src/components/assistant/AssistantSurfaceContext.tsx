"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface AssistantSurfaceActions {
  focusTree: () => void;
  openCreateClient: () => void;
  registerFocusTree: (handler: () => void) => void;
  registerOpenCreateClient: (handler: () => void) => void;
  activeClientId: string | null;
  setActiveClientId: (clientId: string | null) => void;
  pendingFirstMessage: string | null;
  setPendingFirstMessage: (message: string | null) => void;
  startNewChat: () => void;
  registerStartNewChat: (handler: () => void) => void;
  versionComparisonRequest: VersionComparisonRequest | null;
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
  const focusTreeRef = useRef<() => void>(() => {});
  const openCreateClientRef = useRef<() => void>(() => {});
  const startNewChatRef = useRef<() => void>(() => {});

  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(
    null
  );
  const [versionComparisonRequest, setVersionComparisonRequest] =
    useState<VersionComparisonRequest | null>(null);

  const registerFocusTree = useCallback((handler: () => void) => {
    focusTreeRef.current = handler;
  }, []);

  const registerOpenCreateClient = useCallback((handler: () => void) => {
    openCreateClientRef.current = handler;
  }, []);

  const registerStartNewChat = useCallback((handler: () => void) => {
    startNewChatRef.current = handler;
  }, []);

  const focusTree = useCallback(() => {
    focusTreeRef.current();
  }, []);

  const openCreateClient = useCallback(() => {
    openCreateClientRef.current();
  }, []);

  const startNewChat = useCallback(() => {
    startNewChatRef.current();
  }, []);

  const openVersionComparison = useCallback(
    (request: VersionComparisonRequest) => setVersionComparisonRequest(request),
    []
  );

  const closeVersionComparison = useCallback(
    () => setVersionComparisonRequest(null),
    []
  );

  const value = useMemo(
    () => ({
      focusTree,
      openCreateClient,
      registerFocusTree,
      registerOpenCreateClient,
      activeClientId,
      setActiveClientId,
      pendingFirstMessage,
      setPendingFirstMessage,
      startNewChat,
      registerStartNewChat,
      versionComparisonRequest,
      openVersionComparison,
      closeVersionComparison,
    }),
    [
      focusTree,
      openCreateClient,
      registerFocusTree,
      registerOpenCreateClient,
      activeClientId,
      pendingFirstMessage,
      startNewChat,
      registerStartNewChat,
      versionComparisonRequest,
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

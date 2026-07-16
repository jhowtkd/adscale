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
import type { ChatAttachment } from "@/lib/assistant/chat-attachments";
import { useAppStore } from "@/lib/store";

export interface PendingFirstMessage {
  text: string;
  attachments: ChatAttachment[];
}

interface AssistantSurfaceActions {
  focusTree: () => void;
  openCreateClient: () => void;
  registerFocusTree: (handler: () => void) => void;
  registerOpenCreateClient: (handler: () => void) => void;
  activeClientId: string | null;
  setActiveClientId: (clientId: string | null) => void;
  pendingFirstMessage: PendingFirstMessage | null;
  setPendingFirstMessage: (message: PendingFirstMessage | null) => void;
  startNewChat: () => void;
  registerStartNewChat: (handler: () => void) => void;
  versionComparisonRequest: VersionComparisonRequest | null;
  versionComparisonTrigger: HTMLElement | null;
  openVersionComparison: (request: VersionComparisonRequest) => void;
  closeVersionComparison: () => void;
  /**
   * True when the active thread is a goal-agent thread with candidates, so the
   * shell widens the visual workspace column. Set by AssistantMain from the
   * goal projection; read by AssistantShell.
   */
  workspaceMode: boolean;
  setWorkspaceMode: (enabled: boolean) => void;
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

  const activeClientId = useAppStore((state) => state.activeClientProfileId);
  const setActiveClientId = useAppStore(
    (state) => state.setActiveClientProfileId
  );
  const [pendingFirstMessage, setPendingFirstMessage] =
    useState<PendingFirstMessage | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState(false);
  const [versionComparisonRequest, setVersionComparisonRequest] =
    useState<VersionComparisonRequest | null>(null);
  const [versionComparisonTrigger, setVersionComparisonTrigger] =
    useState<HTMLElement | null>(null);

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
      versionComparisonTrigger,
      openVersionComparison,
      closeVersionComparison,
      workspaceMode,
      setWorkspaceMode,
    }),
    [
      focusTree,
      openCreateClient,
      registerFocusTree,
      registerOpenCreateClient,
      activeClientId,
      setActiveClientId,
      pendingFirstMessage,
      startNewChat,
      registerStartNewChat,
      versionComparisonRequest,
      versionComparisonTrigger,
      openVersionComparison,
      closeVersionComparison,
      workspaceMode,
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

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

interface AssistantSurfaceActions {
  focusTree: () => void;
  openCreateClient: () => void;
  registerFocusTree: (handler: () => void) => void;
  registerOpenCreateClient: (handler: () => void) => void;
}

const AssistantSurfaceContext = createContext<AssistantSurfaceActions | null>(
  null
);

export function AssistantSurfaceProvider({ children }: { children: ReactNode }) {
  const focusTreeRef = useRef<() => void>(() => {});
  const openCreateClientRef = useRef<() => void>(() => {});

  const registerFocusTree = useCallback((handler: () => void) => {
    focusTreeRef.current = handler;
  }, []);

  const registerOpenCreateClient = useCallback((handler: () => void) => {
    openCreateClientRef.current = handler;
  }, []);

  const focusTree = useCallback(() => {
    focusTreeRef.current();
  }, []);

  const openCreateClient = useCallback(() => {
    openCreateClientRef.current();
  }, []);

  const value = useMemo(
    () => ({
      focusTree,
      openCreateClient,
      registerFocusTree,
      registerOpenCreateClient,
    }),
    [focusTree, openCreateClient, registerFocusTree, registerOpenCreateClient]
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

"use client";

import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useEffect, useEffectEvent, useReducer } from "react";

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: {
    border: "border-[var(--accent-green)]/30",
    bg: "bg-[var(--accent-green)]/8",
    icon: "text-[var(--accent-green)]",
    progress: "bg-[var(--accent-green)]",
  },
  error: {
    border: "border-[var(--accent-rose)]/30",
    bg: "bg-[var(--accent-rose)]/8",
    icon: "text-[var(--accent-rose)]",
    progress: "bg-[var(--accent-rose)]",
  },
  warning: {
    border: "border-amber-400/30",
    bg: "bg-amber-400/8",
    icon: "text-amber-500",
    progress: "bg-amber-500",
  },
  info: {
    border: "border-[var(--accent-blue)]/30",
    bg: "bg-[var(--accent-blue)]/8",
    icon: "text-[var(--accent-blue)]",
    progress: "bg-[var(--accent-blue)]",
  },
};

interface ToastUiState {
  progress: number;
  exiting: boolean;
}

type ToastUiAction =
  | { type: "progressChanged"; progress: number }
  | { type: "exitStarted" };

function toastUiReducer(state: ToastUiState, action: ToastUiAction): ToastUiState {
  switch (action.type) {
    case "progressChanged":
      return { ...state, progress: action.progress };
    case "exitStarted":
      return { ...state, exiting: true };
  }
}

function ToastItem({
  id,
  type,
  message,
  onRemove,
}: {
  id: string;
  type: keyof typeof styles;
  message: string;
  onRemove: (id: string) => void;
}) {
  const [{ progress, exiting }, dispatch] = useReducer(toastUiReducer, {
    progress: 100,
    exiting: false,
  });
  const Icon = icons[type];
  const style = styles[type];
  // #region agent log
  if (!style || !Icon) {
    fetch("http://127.0.0.1:7899/ingest/cfdc6907-57c9-49e8-855d-2427aa77ea62", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a8b5a7" },
      body: JSON.stringify({
        sessionId: "a8b5a7",
        runId: "pre-fix",
        hypothesisId: "H5",
        location: "ToastStack.tsx:ToastItem",
        message: "invalid toast type",
        data: { type, hasStyle: Boolean(style), hasIcon: Boolean(Icon), messagePreview: message.slice(0, 80) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  const duration = 4000;
  const removeToastAfterTimeout = useEffectEvent(() => onRemove(id));

  useEffect(() => {
    const start = Date.now();
    let rafId: number;
    let removeTimerId: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      dispatch({ type: "progressChanged", progress: remaining });
      if (remaining <= 0) {
        dispatch({ type: "exitStarted" });
        removeTimerId = setTimeout(() => removeToastAfterTimeout(), 300);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (removeTimerId) clearTimeout(removeTimerId);
    };
  }, []);

  const handleDismiss = () => {
    dispatch({ type: "exitStarted" });
    setTimeout(() => onRemove(id), 300);
  };

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 w-[340px] max-w-[calc(100vw-2rem)] rounded-lg border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.1)] backdrop-blur-sm",
        "transition-all duration-300 ease-out",
        exiting ? "translate-x-full opacity-0" : "translate-x-0 opacity-100",
        style.border,
        style.bg
      )}
      role="alert"
    >
      <Icon size={18} className={cn("mt-0.5 shrink-0", style.icon)} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">
          {message}
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 h-[2px] rounded-b-lg overflow-hidden w-full">
        <div
          className={cn("h-full transition-all duration-100 ease-linear", style.progress)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default function ToastStack() {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem
            id={toast.id}
            type={toast.type}
            message={toast.message}
            onRemove={removeToast}
          />
        </div>
      ))}
    </div>
  );
}

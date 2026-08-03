"use client";

import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles = {
  success: {
    border: "border-[var(--success-border)]",
    bg: "bg-[var(--success-bg)]",
    icon: "text-[var(--success-text)]",
    progress: "bg-[var(--success-dot)]",
  },
  error: {
    border: "border-[var(--danger-border)]",
    bg: "bg-[var(--danger-bg)]",
    icon: "text-[var(--danger-text)]",
    progress: "bg-[var(--danger-dot)]",
  },
  warning: {
    border: "border-[var(--warning-border)]",
    bg: "bg-[var(--warning-bg)]",
    icon: "text-[var(--warning-text)]",
    progress: "bg-[var(--warning-dot)]",
  },
  info: {
    border: "border-[var(--info-border)]",
    bg: "bg-[var(--info-bg)]",
    icon: "text-[var(--info-text)]",
    progress: "bg-[var(--info-dot)]",
  },
};

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
  const [exiting, setExiting] = useState(false);
  const Icon = icons[type] ?? icons.info;
  const style = styles[type] ?? styles.info;
  const duration = 4000;
  const removeToastAfterTimeout = useEffectEvent(() => onRemove(id));

  useEffect(() => {
    const removeTimerId = setTimeout(() => {
      setExiting(true);
      setTimeout(() => removeToastAfterTimeout(), 300);
    }, duration);

    return () => clearTimeout(removeTimerId);
  }, [duration]);

  const handleDismiss = () => {
    setExiting(true);
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
      <div className="absolute bottom-0 left-0 h-[2px] rounded-b-lg overflow-hidden w-full">
        <div
          className={cn("h-full animate-toast-progress origin-left", style.progress)}
          style={{ animationDuration: `${duration}ms` }}
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

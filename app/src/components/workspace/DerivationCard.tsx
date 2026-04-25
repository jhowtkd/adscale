"use client";

import { motion } from "framer-motion";
import { Eye, Download, RefreshCw, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";
import { useRegenerateDerivation } from "@/lib/hooks/use-regenerate";
import { useExport } from "@/lib/hooks/use-export";
import { useAppStore } from "@/lib/store";

// ============================================
// Types
// ============================================

interface DerivationCardProps {
  derivation: Derivation;
  index: number;
  onPreview: (id: string) => void;
  onDownload?: (id: string) => void;
  onRegenerate?: (id: string) => void;
  gridSize?: "small" | "medium" | "large";
}

// ============================================
// Progress Ring Component
// ============================================

function ProgressRing({ progress }: { progress: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width={64} height={64} viewBox="0 0 64 64">
        {/* Background circle */}
        <circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke="var(--border-dim)"
          strokeWidth={3}
        />
        {/* Progress circle */}
        <motion.circle
          cx={32}
          cy={32}
          r={radius}
          fill="none"
          stroke="url(#progressGradient)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          transform="rotate(-90 32 32)"
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--accent-blue)" />
            <stop offset="100%" stopColor="var(--accent-teal)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-sm font-semibold text-[var(--text-primary)]">
        {Math.round(progress)}%
      </span>
    </div>
  );
}

// ============================================
// Status Overlay Component
// ============================================

type DerivationDisplayStatus = Derivation["status"] | "queued";

function StatusOverlay({ status, progress }: { status: DerivationDisplayStatus; progress?: number }) {
  switch (status) {
    case "queued":
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(10,15,26,0.7)] rounded-t-[15px]">
          <Clock size={24} className="text-[var(--text-muted)] mb-2" />
          <span className="text-xs font-medium text-[var(--text-muted)]">Queued</span>
          <span className="text-[10px] text-[var(--text-muted)] mt-0.5">
            Waiting for processing slot...
          </span>
        </div>
      );

    case "generating":
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(10,15,26,0.5)] rounded-t-[15px]">
          <ProgressRing progress={progress || 0} />
          <span className="text-xs font-medium text-[var(--text-primary)] mt-2">
            Generating...
          </span>
          <span className="text-[10px] text-[var(--text-muted)] mt-0.5">
            ~8s remaining
          </span>
        </div>
      );

    case "failed":
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(244,63,94,0.15)] rounded-t-[15px]">
          <AlertCircle size={24} className="text-[var(--accent-rose)] mb-2" />
          <span className="text-sm text-[var(--accent-rose)] font-medium">Generation failed</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="mt-2 inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium border border-[var(--accent-rose)]/30 text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 transition-colors"
          >
            Retry
          </button>
        </div>
      );

    default:
      return null;
  }
}

// ============================================
// Spinner Component
// ============================================

function Spinner({ className }: { className?: string }) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className={cn("w-4 h-4 border-2 border-current border-t-transparent rounded-full", className)}
    />
  );
}

// ============================================
// Main Component
// ============================================

export default function DerivationCard({
  derivation,
  index,
  onPreview,
  onDownload,
  onRegenerate,
  gridSize = "medium",
}: DerivationCardProps) {
  const isCompleted = derivation.status === "completed";
  const platformStyle = platformColors[derivation.platform] || {
    bg: "rgba(99,102,241,0.12)",
    text: "#818cf8",
  };

  // Simulated progress per derivation
  const simulatedProgress = Math.min(10 + ((index * 37 + 42) % 90), 98);

  const regenerateMutation = useRegenerateDerivation(derivation.id);
  const exportMutation = useExport();
  const addToast = useAppStore((s) => s.addToast);

  const handleRegenerate = () => {
    if (regenerateMutation.isPending) return;
    regenerateMutation.mutate(undefined, {
      onSuccess: () => {
        onRegenerate?.(derivation.id);
      },
      onError: (err) => {
        addToast("error", err instanceof Error ? err.message : "Failed to regenerate");
      },
    });
  };

  const handleDownload = () => {
    if (exportMutation.isPending) return;
    exportMutation.mutate(
      { type: "individual", derivationId: derivation.id, format: "png" },
      {
        onSuccess: () => {
          onDownload?.(derivation.id);
        },
        onError: (err) => {
          addToast("error", err instanceof Error ? err.message : "Failed to export");
        },
      }
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.35,
        delay: index * 0.08,
        ease: [0.19, 1, 0.22, 1] as const,
      }}
      whileHover={isCompleted ? { y: -4 } : undefined}
      className={cn(
        "group bg-[var(--surface-base)] rounded-[15px] border border-[var(--border-dim)] overflow-hidden transition-all duration-300",
        isCompleted && "hover:border-[var(--border-medium)] hover:shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
      )}
    >
      {/* ---- Image Area (4:5 aspect ratio) ---- */}
      <div className="relative aspect-[4/5] overflow-hidden bg-[var(--surface-raised)]">
        {/* Placeholder gradient */}
        <div
          className={cn(
            "absolute inset-0 transition-transform duration-300",
            isCompleted && "group-hover:scale-[1.03]"
          )}
          style={{
            background: `linear-gradient(135deg, 
              ${platformStyle.bg} 0%, 
              var(--surface-raised) 50%, 
              ${platformStyle.bg} 100%)`,
          }}
        >
          {/* Center icon/initial */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-4xl font-bold opacity-20"
              style={{ color: platformStyle.text }}
            >
              {derivation.name.charAt(0)}
            </span>
          </div>
        </div>

        {/* Status overlay */}
        <StatusOverlay
          status={derivation.status}
          progress={derivation.status === "generating" ? simulatedProgress : undefined}
        />
      </div>

      {/* ---- Info Area ---- */}
      <div className="p-3.5 space-y-2">
        {/* Row 1: Name + Status */}
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-[var(--text-primary)] truncate">
            {derivation.name}
          </h4>
          <StatusBadge status={derivation.status} showDot={false} className="flex-shrink-0" />
        </div>

        {/* Row 2: Platform tag */}
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: platformStyle.bg,
              color: platformStyle.text,
            }}
          >
            {derivation.platform}
          </span>
          <span className="text-[10px] text-[var(--text-muted)]">
            Angle 0{((index % 3) + 1)}
          </span>
        </div>

        {/* Row 3: Prompt preview */}
        <p className="text-[13px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
          {derivation.prompt}
        </p>

        {/* Row 4: Cost + Actions */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-[var(--text-muted)]">
            ~{derivation.creditCost} credits
          </span>

          <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={() => onPreview(derivation.id)}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)] transition-all duration-150"
              title="Preview"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={handleDownload}
              disabled={exportMutation.isPending}
              className={cn(
                "p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)] transition-all duration-150",
                exportMutation.isPending && "opacity-50 cursor-wait"
              )}
              title="Download"
            >
              {exportMutation.isPending ? (
                <Spinner />
              ) : (
                <Download size={16} />
              )}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={regenerateMutation.isPending}
              className={cn(
                "p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)] transition-all duration-150",
                regenerateMutation.isPending && "opacity-50 cursor-wait"
              )}
              title="Regenerate"
            >
              {regenerateMutation.isPending ? (
                <Spinner />
              ) : (
                <RefreshCw size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

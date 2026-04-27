"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, Check, X, RefreshCw, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Derivation } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface ComparisonViewProps {
  baseImageUrl?: string;
  derivation: Derivation | null;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onRegenerate: (id: string, feedback: string) => void;
  onDownload: (id: string, format: string) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
  isRegenerating?: boolean;
  isDownloading?: boolean;
}

// ============================================
// Component
// ============================================

export default function ComparisonView({
  baseImageUrl,
  derivation,
  onApprove,
  onReject,
  onRegenerate,
  onDownload,
  isApproving,
  isRejecting,
  isRegenerating,
  isDownloading,
}: ComparisonViewProps) {
  const [splitPosition, setSplitPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [exportFormat, setExportFormat] = useState("png");
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(20, Math.min(80, (x / rect.width) * 100));
      setSplitPosition(percentage);
    },
    [isDragging]
  );

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!derivation) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)]">
        <p className="text-sm text-[var(--text-muted)]">Select a derivation to compare</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---- Split View ---- */}
      <div
        ref={containerRef}
        className="relative h-[500px] bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)] overflow-hidden select-none"
        onMouseMove={handleMouseMove}
        style={{ cursor: isDragging ? "col-resize" : "default" }}
      >
        {/* Left panel - Base Creative */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)] mb-4">
              Base Creative
            </span>
            <div
              className="relative w-full max-w-[400px] aspect-square rounded-lg overflow-hidden"
              style={{
                background: `linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(20,184,166,0.05) 100%)`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl font-bold text-[var(--accent-blue)]/10">
                  {derivation.name.charAt(0)}
                </span>
              </div>
              {baseImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={baseImageUrl}
                  alt="Base creative"
                  className="absolute inset-0 w-full h-full object-contain"
                />
              )}
            </div>
            <div className="mt-3 text-center">
              <p className="text-xs text-[var(--text-muted)]">Original upload</p>
              <p className="text-xs text-[var(--text-muted)]">1200 \u00d7 1200px</p>
            </div>
          </div>
        </div>

        {/* Right panel - Derivation */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 0 0 ${splitPosition}%)` }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Derivation
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded-full",
                  derivation.status === "completed"
                    ? "bg-[rgba(20,184,166,0.12)] text-[var(--accent-teal)]"
                    : "bg-[rgba(245,158,11,0.12)] text-[var(--accent-amber)]"
                )}
              >
                {derivation.status}
              </span>
            </div>
            <div
              className="relative w-full max-w-[400px] aspect-square rounded-lg overflow-hidden"
              style={{
                background: `linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(99,102,241,0.05) 100%)`,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-6xl font-bold text-[var(--accent-purple)]/10">
                  {derivation.name.charAt(0)}
                </span>
              </div>
              {derivation.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={derivation.imageUrl}
                  alt={derivation.name}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              )}
            </div>
            <div className="mt-3 text-center space-y-1">
              <p className="text-xs text-[var(--text-primary)] font-medium">{derivation.name}</p>
              <p className="text-xs text-[var(--text-muted)] line-clamp-1 max-w-[400px]">
                {derivation.prompt}
              </p>
            </div>
          </div>
        </div>

        {/* Divider with handle */}
        <div
          className="absolute top-0 bottom-0 z-10"
          style={{ left: `${splitPosition}%`, transform: "translateX(-50%)" }}
        >
          {/* Line */}
          <div className="w-0.5 h-full bg-[var(--border-medium)]" />

          {/* Handle */}
          <div
            className={cn(
              "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "w-8 h-8 rounded-full bg-[var(--surface-raised)] border border-[var(--border-medium)]",
              "flex items-center justify-center cursor-col-resize shadow-lg",
              "hover:border-[var(--accent-blue)] hover:shadow-[0_0_12px_rgba(99,102,241,0.2)]",
              "transition-all duration-150"
            )}
            onMouseDown={handleMouseDown}
          >
            <GripVertical size={14} className="text-[var(--text-muted)]" />
          </div>
        </div>

        {/* Labels overlay */}
        <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-[var(--surface-base)]/80 text-[10px] font-medium text-[var(--text-muted)]">
          Base
        </div>
        <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-[var(--surface-base)]/80 text-[10px] font-medium text-[var(--text-muted)]">
          Derivation
        </div>
      </div>

      {/* ---- Toolbar ---- */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          {/* Approve */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => onApprove(derivation.id)}
            disabled={isApproving}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white bg-[var(--accent-teal)] hover:opacity-90 transition-opacity",
              isApproving && "opacity-60 cursor-wait"
            )}
          >
            {isApproving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
              />
            ) : (
              <Check size={16} />
            )}
            Approve
          </motion.button>

          {/* Reject */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (showFeedback) {
                onReject(derivation.id, feedback);
                setShowFeedback(false);
                setFeedback("");
              } else {
                setShowFeedback(true);
              }
            }}
            disabled={isRejecting}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-[var(--accent-rose)]/30 text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 transition-colors",
              isRejecting && "opacity-60 cursor-wait"
            )}
          >
            {isRejecting ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-[var(--accent-rose)] border-t-transparent rounded-full"
              />
            ) : (
              <X size={16} />
            )}
            Reject
          </motion.button>

          {/* Regenerate with feedback */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (showFeedback && feedback.trim()) {
                onRegenerate(derivation.id, feedback);
                setShowFeedback(false);
                setFeedback("");
              } else {
                setShowFeedback(!showFeedback);
              }
            }}
            disabled={isRegenerating}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-[var(--border-dim)] text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)] transition-colors",
              isRegenerating && "opacity-60 cursor-wait"
            )}
          >
            {isRegenerating ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              />
            ) : (
              <RefreshCw size={14} />
            )}
            Regenerate
          </motion.button>
        </div>

        {/* Export controls */}
        <div className="flex items-center gap-2">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            className="h-9 px-3 text-xs rounded-md bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] focus:border-[var(--accent-blue)] focus:outline-none"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => onDownload(derivation.id, exportFormat)}
            disabled={isDownloading}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-[var(--border-dim)] text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.04)] transition-colors",
              isDownloading && "opacity-60 cursor-wait"
            )}
          >
            {isDownloading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
              />
            ) : (
              <Download size={14} />
            )}
            Download
          </motion.button>
        </div>
      </div>

      {/* ---- Feedback textarea ---- */}
      <AnimatePresence>
        {showFeedback && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
            className="overflow-hidden"
          >
            <textarea
              placeholder="What would you like changed?"
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="w-full bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-lg p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] focus:ring-[3px] focus:ring-[rgba(99,102,241,0.15)] focus:outline-none resize-none"
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => {
                  if (feedback.trim()) {
                    onRegenerate(derivation.id, feedback);
                    setShowFeedback(false);
                    setFeedback("");
                  }
                }}
                disabled={isRegenerating}
                className={cn(
                  "inline-flex items-center rounded-md px-4 py-2 text-xs font-medium text-white bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)] transition-colors",
                  isRegenerating && "opacity-60 cursor-wait"
                )}
              >
                {isRegenerating ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-3 h-3 border-2 border-white border-t-transparent rounded-full mr-1.5"
                  />
                ) : null}
                Submit Feedback
              </button>
              <button
                onClick={() => {
                  setShowFeedback(false);
                  setFeedback("");
                }}
                className="inline-flex items-center rounded-md px-4 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

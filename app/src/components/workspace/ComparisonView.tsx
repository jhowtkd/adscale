"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical, Check, X, RefreshCw, Download } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const commonT = useTranslations("common");
  const [isDragging, setIsDragging] = useState(false);
  const [exportFormat, setExportFormat] = useState("png");
  const t = useTranslations("derivation");
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
      <div className="flex items-center justify-center h-[400px] glass-card rounded-xl">
        <p className="text-sm text-[var(--text-muted)]">Select a derivation to compare</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ---- Split View ---- */}
      <div
        ref={containerRef}
        className="relative h-[500px] glass-card rounded-xl overflow-hidden select-none"
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
                background: "var(--accent-green-dim)",
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
                background: "var(--accent-green-dim)",
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
              "hover:border-[var(--accent-green)] hover:shadow-[0_0_12px_var(--accent-green-dim)0.2)]",
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

      {/* ---- Score Panel ---- */}
      {derivation.qualityScore != null && (
        <div className="bg-[var(--surface-raised)] rounded-lg border border-[var(--border-dim)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {t("creativeScore")}
            </span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {derivation.qualityScore}
            </span>
          </div>
          {derivation.scoreBreakdown && (
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(derivation.scoreBreakdown).map(([key, value]) => (
                <div key={key} className="text-center">
                  <div className="text-[10px] text-[var(--text-muted)] capitalize">
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">{value}</div>
                </div>
              ))}
            </div>
          )}
          {derivation.scoreIssues && derivation.scoreIssues.length > 0 && (
            <div>
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {t("detectedIssues")}
              </span>
              <ul className="mt-1 space-y-0.5">
                {derivation.scoreIssues.map((issue, i) => (
                  <li key={i} className="text-[11px] text-[var(--text-secondary)]">
                    • {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---- Toolbar ---- */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          {/* Approve */}
          <button
            onClick={() => onApprove(derivation.id)}
            disabled={isApproving}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white bg-[var(--accent-teal)] hover:opacity-90 transition-opacity active:scale-[0.95]",
              isApproving && "opacity-60 cursor-wait"
            )}
          >
            {isApproving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check size={16} />
            )}
            {commonT("approve")}
          </button>

          {/* Reject */}
          <button
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
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-[var(--accent-rose)]/30 text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 transition-colors active:scale-[0.95]",
              isRejecting && "opacity-60 cursor-wait"
            )}
          >
            {isRejecting ? (
              <div className="w-4 h-4 border-2 border-[var(--accent-rose)] border-t-transparent rounded-full animate-spin" />
            ) : (
              <X size={16} />
            )}
            {commonT("reject")}
          </button>

          {/* Guided regeneration */}
          {derivation.regenerationSuggestion && (
            <button
              onClick={() => {
                setFeedback(derivation.regenerationSuggestion || "");
                setShowFeedback(true);
              }}
              disabled={isRegenerating}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-[var(--accent-blue)]/30 text-[var(--accent-blue)] hover:bg-[var(--accent-blue)]/10 transition-colors active:scale-[0.95]",
                isRegenerating && "opacity-60 cursor-wait"
              )}
            >
              {isRegenerating ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {t("regenerateWithImprovements")}
            </button>
          )}

          {/* Regenerate with feedback */}
          <button
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
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-[var(--border-dim)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] transition-colors active:scale-[0.95]",
              isRegenerating && "opacity-60 cursor-wait"
            )}
          >
            {isRegenerating ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {commonT("regenerate")}
          </button>
        </div>

        {/* Export controls */}
        <div className="flex items-center gap-2">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            className="h-9 px-3 text-xs rounded-md bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] focus:border-[var(--accent-green)] focus:outline-none"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>

          <button
            onClick={() => onDownload(derivation.id, exportFormat)}
            disabled={isDownloading}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium border border-[var(--border-dim)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors active:scale-[0.95]",
              isDownloading && "opacity-60 cursor-wait"
            )}
          >
            {isDownloading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {commonT("download")}
          </button>
        </div>
      </div>

      {/* ---- Feedback textarea ---- */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300",
          showFeedback ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <textarea
          placeholder="What would you like changed?"
          rows={3}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className="w-full bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-lg p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-green)] focus:ring-[3px] focus:ring-[var(--accent-green-dim)0.15)] focus:outline-none resize-none"
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
              "inline-flex items-center rounded-md px-4 py-2 text-xs font-medium text-white bg-[var(--accent-green)] hover:bg-[var(--accent-green-light)] transition-colors",
              isRegenerating && "opacity-60 cursor-wait"
            )}
          >
            {isRegenerating ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
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
            {commonT("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

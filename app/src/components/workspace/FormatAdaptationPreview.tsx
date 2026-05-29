"use client";

import { useSmartResizePreview } from "@/lib/hooks/use-smart-resize";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

interface FormatAdaptationPreviewProps {
  campaignId: string;
}

export default function FormatAdaptationPreview({ campaignId }: FormatAdaptationPreviewProps) {
  const t = useTranslations("upload");
  const { data, isLoading } = useSmartResizePreview(campaignId);
  const formatLabels: Record<string, string> = {
    "1:1": t("formatLabels.square"),
    "4:5": t("formatLabels.portrait"),
    "9:16": t("formatLabels.stories"),
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] py-3">
        <Loader2 size={14} className="animate-spin" />
        {t("analyzingBaseImage")}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Compliance badges */}
      {data.recommendations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.recommendations.map((rec) => (
            <span
              key={rec.platform}
              className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border ${
                rec.compliance === "pass"
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  : rec.compliance === "warning"
                  ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                  : "text-rose-400 bg-rose-500/10 border-rose-500/20"
              }`}
            >
              {rec.compliance === "pass" ? <Check size={10} /> : <AlertTriangle size={10} />}
              {rec.platform.replace("_", " ")}
              {rec.recommendation && (
                <span className="opacity-70">— {rec.recommendation}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Preview grid */}
      {data.analysis.crops && (
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(data.analysis.crops).map(([format, crop]) => (
            <div key={format} className="space-y-1.5">
              <div className="relative bg-[var(--surface-raised)] border border-[var(--border-dim)] rounded-lg overflow-hidden"
                style={{
                  aspectRatio: format === "1:1" ? "1/1" : format === "4:5" ? "4/5" : "9/16",
                }}
              >
                {/* Crop overlay visualization */}
                <div
                  className="absolute border-2 border-[var(--accent-green)] rounded bg-[var(--accent-green)]/5"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`,
                    height: `${crop.height * 100}%`,
                  }}
                />
                {/* Center crosshair */}
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <div className="w-full h-px bg-[var(--accent-green)]" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <div className="h-full w-px bg-[var(--accent-green)]" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-[var(--text-primary)]">{formatLabels[format] ?? format}</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {Math.round(crop.x * 100)}%, {Math.round(crop.y * 100)}% • {Math.round(crop.width * 100)}%×{Math.round(crop.height * 100)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

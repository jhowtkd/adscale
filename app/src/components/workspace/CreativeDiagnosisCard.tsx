"use client";

import { RefreshCw, Edit3, Wand2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Campaign } from "@/lib/mock-data";

export interface CreativeDiagnosisCardProps {
  campaign: Campaign;
  editing: boolean;
  localDiagnosis: {
    detectedConcept: string;
    elementsToPreserve: string;
    variationOpportunities: string;
  };
  setLocalDiagnosis: (value: {
    detectedConcept: string;
    elementsToPreserve: string;
    variationOpportunities: string;
  }) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  isGenerating: boolean;
  isSaving: boolean;
  tBriefing: (key: string, values?: Record<string, string | number | Date>) => string;
}

export default function CreativeDiagnosisCard({
  campaign,
  editing,
  localDiagnosis,
  setLocalDiagnosis,
  onEdit,
  onSave,
  onCancel,
  onGenerate,
  onRegenerate,
  isGenerating,
  isSaving,
  tBriefing,
}: CreativeDiagnosisCardProps) {
  const status = campaign.creativeDiagnosisStatus ?? "pending";
  const diagnosis = campaign.creativeDiagnosis;
  const hasDiagnosis = status === "ready" && diagnosis != null;
  const isFailed = status === "failed";
  const isAnalyzing = status === "analyzing" || isGenerating;

  return (
    <div className="rounded-lg border border-[var(--border-dim)] bg-[var(--surface-base)] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {tBriefing("diagnosis.title")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {tBriefing("diagnosis.subtitle")}
          </p>
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium",
            isAnalyzing && "bg-amber-500/10 text-amber-500",
            hasDiagnosis && "bg-[var(--accent-mint)]/10 text-[var(--accent-mint)]",
            isFailed && "bg-[var(--accent-rose)]/10 text-[var(--accent-rose)]",
            status === "pending" && "bg-[var(--surface-raised)] text-[var(--text-secondary)]"
          )}
        >
          {tBriefing(`diagnosis.status.${isAnalyzing ? "analyzing" : hasDiagnosis ? "ready" : isFailed ? "failed" : "pending"}`)}
        </span>
      </div>

      {isAnalyzing && (
        <p className="text-xs text-[var(--text-secondary)]">{tBriefing("diagnosis.analyzing")}</p>
      )}

      {isFailed && !editing && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--accent-rose)]">{tBriefing("diagnosis.failed")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)] disabled:opacity-60"
            >
              <RefreshCw size={12} />
              {tBriefing("diagnosis.retry")}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
            >
              <Edit3 size={12} />
              {tBriefing("diagnosis.edit")}
            </button>
          </div>
        </div>
      )}

      {hasDiagnosis && !editing && (
        <div className="space-y-3">
          <div className="rounded-md bg-[var(--surface-raised)] p-3 space-y-2">
            <div>
              <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                {tBriefing("diagnosis.detectedConcept")}
              </p>
              <p className="text-xs text-[var(--text-primary)] mt-0.5">{diagnosis.detectedConcept}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                {tBriefing("diagnosis.elementsToPreserve")}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {diagnosis.elementsToPreserve.map((item, i) => (
                  <li key={i} className="text-xs text-[var(--text-primary)] list-disc list-inside">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                {tBriefing("diagnosis.variationOpportunities")}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {diagnosis.variationOpportunities.map((item, i) => (
                  <li key={i} className="text-xs text-[var(--text-primary)] list-disc list-inside">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
            >
              <Edit3 size={12} />
              {tBriefing("diagnosis.edit")}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)] disabled:opacity-60"
            >
              <RefreshCw size={12} />
              {tBriefing("diagnosis.regenerate")}
            </button>
          </div>
        </div>
      )}

      {status === "pending" && !editing && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">{tBriefing("diagnosis.pending")}</p>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)] disabled:opacity-60"
          >
            <Wand2 size={12} />
            {tBriefing("diagnosis.generate")}
          </button>
        </div>
      )}

      {editing && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-[var(--text-secondary)]">
              {tBriefing("diagnosis.detectedConcept")}
            </Label>
            <Textarea
              rows={2}
              value={localDiagnosis.detectedConcept}
              onChange={(e) => setLocalDiagnosis({ ...localDiagnosis, detectedConcept: e.target.value })}
              className="bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] resize-none"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-[var(--text-secondary)]">
              {tBriefing("diagnosis.elementsToPreserve")}
            </Label>
            <Textarea
              rows={3}
              value={localDiagnosis.elementsToPreserve}
              onChange={(e) => setLocalDiagnosis({ ...localDiagnosis, elementsToPreserve: e.target.value })}
              placeholder={tBriefing("diagnosis.listPlaceholder")}
              className="bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] resize-none"
            />
            <p className="text-[10px] text-[var(--text-muted)]">{tBriefing("diagnosis.listHelp")}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-[var(--text-secondary)]">
              {tBriefing("diagnosis.variationOpportunities")}
            </Label>
            <Textarea
              rows={3}
              value={localDiagnosis.variationOpportunities}
              onChange={(e) => setLocalDiagnosis({ ...localDiagnosis, variationOpportunities: e.target.value })}
              placeholder={tBriefing("diagnosis.listPlaceholder")}
              className="bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] resize-none"
            />
            <p className="text-[10px] text-[var(--text-muted)]">{tBriefing("diagnosis.listHelp")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-mint)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-mint-light)] disabled:opacity-60"
            >
              <Check size={12} />
              {tBriefing("diagnosis.save")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-dim)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
            >
              <X size={12} />
              {tBriefing("diagnosis.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

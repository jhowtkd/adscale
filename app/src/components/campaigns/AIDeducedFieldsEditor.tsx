"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiDeducedFields } from "@/server/validation/ai-deduction";

interface AIDeducedFieldsEditorProps {
  analysis: AiDeducedFields | null;
  onChange: (fields: Partial<Record<string, string>>) => void;
  isLoading?: boolean;
}

interface EditableField {
  key: string;
  label: string;
  value: string;
  confidence?: "high" | "medium" | "low";
  isArray?: boolean;
}

function getInitialFields(analysis: AiDeducedFields | null): Record<string, string> {
  if (!analysis) return {};
  return {
    product: analysis.product?.value || "",
    objective: analysis.objective?.value || "",
    targetAudience: analysis.targetAudience?.value || "",
    tone: analysis.tone?.value || "",
    offer: analysis.offer?.value || "",
    platforms: analysis.platforms?.value?.join(", ") || "",
  };
}

export function AIDeducedFieldsEditor({ 
  analysis, 
  onChange, 
  isLoading 
}: AIDeducedFieldsEditorProps) {
  const tCampaign = useTranslations("campaign");
  const tCommon = useTranslations("common");
  
  const [editedFields, setEditedFields] = useState<Record<string, string>>(() => getInitialFields(analysis));
  const [hasUserEdits, setHasUserEdits] = useState(false);
  const [prevAnalysis, setPrevAnalysis] = useState<AiDeducedFields | null>(analysis);

  // Reset edited fields when analysis changes (but preserve user edits)
  if (analysis !== prevAnalysis && !hasUserEdits) {
    setPrevAnalysis(analysis);
    const initialValues = getInitialFields(analysis);
    setEditedFields(initialValues);
  }

  // Convert analysis to editable fields
  const fields: EditableField[] = analysis ? [
    { key: "product", label: tCampaign("product"), value: analysis.product?.value || "", confidence: analysis.product?.confidence },
    { key: "objective", label: tCampaign("objective"), value: analysis.objective?.value || "", confidence: analysis.objective?.confidence },
    { key: "targetAudience", label: tCampaign("audience"), value: analysis.targetAudience?.value || "", confidence: analysis.targetAudience?.confidence },
    { key: "tone", label: tCampaign("tone"), value: analysis.tone?.value || "", confidence: analysis.tone?.confidence },
    { key: "offer", label: tCampaign("offer"), value: analysis.offer?.value || "", confidence: analysis.offer?.confidence },
    { key: "platforms", label: tCampaign("platforms"), value: analysis.platforms?.value?.join(", ") || "", confidence: analysis.platforms?.confidence, isArray: true },
  ] : [];

  const handleFieldChange = useCallback((key: string, value: string) => {
    setEditedFields(prev => {
      const updated = { ...prev, [key]: value };
      setHasUserEdits(true);
      onChange(updated);
      return updated;
    });
  }, [onChange]);

  const getConfidenceBadge = (confidence?: string) => {
    switch (confidence) {
      case "high":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--accent-green-dim)0.15)] text-[var(--accent-green)]">
            {tCommon("confidenceHigh")}
          </span>
        );
      case "medium":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(245,158,11,0.15)] text-amber-600">
            {tCommon("confidenceMedium")}
          </span>
        );
      case "low":
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[rgba(239,68,68,0.15)] text-red-500">
            {tCommon("confidenceLow")}
          </span>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-[var(--accent-blue)] animate-pulse" />
          <span className="text-sm text-[var(--text-secondary)]">{tCampaign("analyzingCreative")}</span>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-4 w-20 bg-[var(--surface-base)] rounded animate-pulse" />
            <div className="h-10 bg-[var(--surface-base)] rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!analysis || fields.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[var(--accent-blue)]" />
          <h3 className="text-sm font-medium text-[var(--text-primary)]">
            {tCampaign("aiDeducedFields")}
          </h3>
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {tCampaign("aiFieldsHint")}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                {field.label}
              </label>
              {getConfidenceBadge(field.confidence)}
            </div>
            <input
              type="text"
              value={editedFields[field.key] ?? field.value}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder={tCampaign(`placeholder.${field.key}`)}
              className={cn(
                "w-full h-9 px-3 bg-[var(--surface-base)] border rounded-md text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-blue)] focus:border-[var(--accent-blue)] transition-colors",
                field.confidence === "high" && "border-[var(--accent-green)]/30",
                field.confidence === "medium" && "border-amber-500/30",
                field.confidence === "low" && "border-red-500/30"
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

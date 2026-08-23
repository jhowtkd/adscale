"use client";

import { useState } from "react";
import { m } from "@/components/animations/MotionBoundary";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Copy, Pencil, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ContextualHelp } from "@/components/ui/contextual-help";
import type { CampaignTemplate } from "@/lib/hooks/use-templates";

interface TemplateCardProps {
  template: CampaignTemplate;
  index: number;
  onUse: (template: CampaignTemplate) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export default function TemplateCard({
  template,
  index,
  onUse,
  onDelete,
  onRename,
}: TemplateCardProps) {
  const tTemplate = useTranslations("template");
  const tCampaign = useTranslations("campaign");
  const tCommon = useTranslations("common");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const modeLabels: Record<string, string> = {
    art_variation: tCampaign("modes.artVariation.label"),
    format_adaptation: tCampaign("modes.formatAdaptation.label"),
    restyling: tCampaign("modes.restyling.label"),
  };
  const modeDescriptions: Record<string, string> = {
    art_variation: tCampaign("modes.artVariation.description"),
    format_adaptation: tCampaign("modes.formatAdaptation.description"),
    restyling: tCampaign("modes.restyling.description"),
  };
  const modeLabel = modeLabels[template.generationMode] || template.generationMode;
  const modeDescription = modeDescriptions[template.generationMode];

  const handleSave = () => {
    if (editName.trim() && editName.trim() !== template.name) {
      onRename(template.id, editName.trim());
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(template.name);
    setIsEditing(false);
  };

  return (
    <m.div
      data-testid={`template-card-${template.id}`}
      // Keep opacity at 1 so cards stay visible if motion stalls (headless/a11y)
      initial={{ opacity: 1, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 6) * 0.04 }}
      className="bg-[var(--surface-raised)] border border-[var(--border-dim)] rounded-lg p-5 hover:border-[var(--border-medium)] transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-sm bg-[var(--surface-base)] border-[var(--border-dim)]"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
              />
              <button
                type="button"
                onClick={handleSave}
                className="rounded-[var(--radius-control)] text-[var(--utility-icon)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                aria-label={tCommon("save")}
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-[var(--radius-control)] text-[var(--utility-icon)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                aria-label={tCommon("cancel")}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {template.name}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditName(template.name);
                  setIsEditing(true);
                }}
                className="rounded-[var(--radius-control)] text-[var(--utility-icon)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                aria-label={tCommon("edit")}
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
          {template.description && (
            <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
              {template.description}
            </p>
          )}
        </div>
        <span className="ml-2 inline-flex shrink-0 items-center gap-1">
          <Badge variant="neutral" className="text-[10px]">
            {modeLabel}
          </Badge>
          {modeDescription ? (
            <ContextualHelp label={tTemplate("modeHelpLabel", { mode: modeLabel })}>
              {modeDescription}
            </ContextualHelp>
          ) : null}
        </span>
      </div>

      <div className="space-y-1.5 mb-4">
        {template.client && (
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">
              {tCampaign("client")}:{" "}
            </span>
            {template.client}
          </p>
        )}
        {template.ctaVariants && template.ctaVariants.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">
              {tTemplate("ctaCount", { count: template.ctaVariants.filter(Boolean).length })}
            </span>
          </p>
        )}
        {template.targetFormats && template.targetFormats.length > 0 && (
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--text-muted)]">
              {tTemplate("formats")}:{" "}
            </span>
            {template.targetFormats.join(", ")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => onUse(template)}
          className="flex-1 bg-[var(--action-primary-bg)] text-xs text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]"
        >
          <Copy size={14} aria-hidden="true" />
          {tTemplate("useTemplate")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(template.id)}
          className="text-[var(--utility-icon)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)]"
          aria-label={tTemplate("delete")}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </m.div>
  );
}

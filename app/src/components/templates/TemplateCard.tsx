"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Copy, Pencil, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const modeLabels: Record<string, string> = {
    art_variation: tCampaign("modes.artVariation.label"),
    format_adaptation: tCampaign("modes.formatAdaptation.label"),
    restyling: tCampaign("modes.restyling.label"),
  };

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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
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
              <button type="button" onClick={handleSave} className="text-[var(--accent-green)] hover:text-[var(--accent-green-light)]">
                <Check size={16} />
              </button>
              <button type="button" onClick={handleCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {template.name}
              </h3>
              <button type="button"
                onClick={() => {
                  setEditName(template.name);
                  setIsEditing(true);
                }}
                className="text-[var(--text-muted)] hover:text-[var(--accent-green)] transition-colors"
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
        <Badge
          variant={
            template.generationMode === "art_variation"
              ? "info"
              : template.generationMode === "format_adaptation"
                ? "success"
                : "neutral"
          }
          className="text-[10px] flex-shrink-0 ml-2"
        >
          {modeLabels[template.generationMode] || template.generationMode}
        </Badge>
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
          className="flex-1 text-xs"
        >
          <Copy size={14} aria-hidden="true" />
          {tTemplate("useTemplate")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(template.id)}
          className="text-[var(--text-muted)] hover:text-[var(--danger-text)] hover:bg-[var(--danger-bg)]"
          aria-label={tTemplate("delete")}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </m.div>
  );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Copy, Pencil, Check, X } from "lucide-react";
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
  const [editName, setEditName] = useState(template.name);

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
    <motion.div
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
              <button onClick={handleSave} className="text-[var(--accent-mint)] hover:text-[var(--accent-mint-light)]">
                <Check size={16} />
              </button>
              <button onClick={handleCancel} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {template.name}
              </h3>
              <button
                onClick={() => setIsEditing(true)}
                className="text-[var(--text-muted)] hover:text-[var(--accent-mint)] transition-colors"
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
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0 ml-2",
            template.generationMode === "art_variation" &&
              "bg-[rgba(99,102,241,0.12)] text-[#818cf8]",
            template.generationMode === "format_adaptation" &&
              "bg-[rgba(45,182,125,0.12)] text-[#2db67d]"
          )}
        >
          {modeLabels[template.generationMode] || template.generationMode}
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
          className="flex-1 bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)] text-xs"
        >
          <Copy size={14} className="mr-1.5" />
          {tTemplate("useTemplate")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDelete(template.id)}
          className="border-[var(--border-dim)] text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:border-[var(--accent-rose)]"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </motion.div>
  );
}

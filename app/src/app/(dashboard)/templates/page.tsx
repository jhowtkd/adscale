"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import Panel from "@/components/layout/Panel";
import {
  useTemplates,
  useDeleteTemplate,
  useUpdateTemplate,
  type CampaignTemplate,
} from "@/lib/hooks/use-templates";
import TemplateCard from "@/components/templates/TemplateCard";

export default function TemplatesPage() {
  const router = useRouter();
  const tTemplate = useTranslations("template");

  const { data: templates, isLoading } = useTemplates();
  const deleteTemplate = useDeleteTemplate();
  const updateTemplate = useUpdateTemplate();

  const handleUseTemplate = (template: CampaignTemplate) => {
    // Keep this destination literal: the convergence inventory tracks CTA routes statically.
    router.push(`/?mode=briefing&templateId=${encodeURIComponent(template.id)}&compose=1`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(tTemplate("deleteConfirm"))) return;
    try {
      await deleteTemplate.mutateAsync(id);
    } catch {
      // Error handled by hook toast
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      await updateTemplate.mutateAsync({ id, data: { name } });
    } catch {
      // Error handled by hook toast
    }
  };

  return (
    <PageFrame width="operational" className="space-y-6">
      <PageHeader
        title={tTemplate("title")}
        description={tTemplate("subtitle")}
        actions={templates && templates.length > 0 ? (
          <Button
            onClick={() => router.push("/?mode=briefing&compose=1")}
            className="bg-[var(--action-primary-bg)] text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]"
          >
            <Plus size={16} aria-hidden="true" />
            {tTemplate("createFromCampaign")}
          </Button>
        ) : undefined}
      />

      <Panel padding={isLoading || (templates && templates.length > 0) ? "sm" : "none"}>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)] p-5"
              />
            ))}
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template, index) => (
              <TemplateCard
                key={template.id}
                template={template}
                index={index}
                onUse={handleUseTemplate}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              icon={FileText}
              title={tTemplate("emptyTitle")}
              description={tTemplate("emptyDescription")}
              action={{
                label: tTemplate("createFromCampaign"),
                href: "/?mode=briefing&compose=1",
              }}
            />
          </div>
        )}
      </Panel>
    </PageFrame>
  );
}

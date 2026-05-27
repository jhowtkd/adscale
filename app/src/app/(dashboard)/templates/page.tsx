"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/ui/EmptyState";
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
    // Navigate to campaign creation with template ID
    router.push(`/campaigns?templateId=${template.id}`);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {tTemplate("title")}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {tTemplate("subtitle")}
          </p>
        </div>
        <Button
          onClick={() => router.push("/campaigns")}
          className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
        >
          <Plus size={16} className="mr-2" />
          {tTemplate("createFromCampaign")}
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-[var(--surface-raised)] border border-[var(--border-dim)] rounded-lg p-5 h-48 animate-pulse"
            />
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <EmptyState
          icon={FileText}
          title={tTemplate("emptyTitle")}
          description={tTemplate("emptyDescription")}
          action={{
            label: tTemplate("createFromCampaign"),
            href: "/campaigns",
          }}
        />
      )}
    </div>
  );
}

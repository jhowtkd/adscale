"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClientReferences } from "@/lib/hooks/use-client-profiles";
import { useWorkspaceAssets } from "@/lib/hooks/use-workspace-assets";
import { useGuidedFlowCommand } from "@/lib/hooks/use-guided-flow-commands";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";
import { uploadChatAttachment } from "@/lib/assistant/chat-attachments";
import { FROM_ZERO_MIN_REFERENCES } from "@/lib/guided-flow/types";

export interface FromZeroReferencesPanelProps {
  threadId: string;
  clientProfileId: string;
  guidedFlow: GuidedFlow;
}

export default function FromZeroReferencesPanel({
  threadId,
  clientProfileId,
  guidedFlow,
}: FromZeroReferencesPanelProps) {
  const t = useTranslations("assistant.guidedFlow.fromZero");
  const uploadRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(guidedFlow.referenceIds ?? [])
  );
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { data: refs = [] } = useClientReferences(clientProfileId);
  const { data: assetsData, isLoading } = useWorkspaceAssets({ limit: 24 });
  const saveReferences = useGuidedFlowCommand(threadId);

  const workspaceAssets = assetsData?.assets ?? [];

  const items = useMemo(
    () => [
      ...refs.map((ref) => ({
        id: ref.id,
        label: ref.label,
        url: ref.url,
        source: "client" as const,
      })),
      ...workspaceAssets.map((asset) => ({
        id: asset.id,
        label: asset.name,
        url: asset.url,
        source: "workspace" as const,
      })),
    ],
    [refs, workspaceAssets]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = async () => {
    setError(null);
    try {
      await saveReferences.mutateAsync({
        commandId: crypto.randomUUID(),
        expectedRevision: guidedFlow.revision ?? 0,
        command: { type: "set_references", referenceIds: [...selected] },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    }
  };

  const count = selected.size;
  const canContinue = count >= FROM_ZERO_MIN_REFERENCES && !saveReferences.isPending;

  return (
    <div
      className="mx-4 mt-2 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
      data-testid="from-zero-references-panel"
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {t("referencesTitle")}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t("referencesSubtitle", { min: FROM_ZERO_MIN_REFERENCES, count })}
      </p>

      <input
        ref={uploadRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError(null);
          setIsUploading(true);
          void uploadChatAttachment(file)
            .then((asset) => {
              setSelected((current) => new Set([...current, asset.assetId]));
            })
            .catch((cause) => {
              setError(cause instanceof Error ? cause.message : t("saveFailed"));
            })
            .finally(() => {
              setIsUploading(false);
            });
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        disabled={isUploading || saveReferences.isPending}
        onClick={() => uploadRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="mr-2 size-4" aria-hidden="true" />
        )}
        {isUploading ? t("uploading") : t("upload")}
      </Button>

      {isLoading ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">{t("empty")}</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <button
                key={`${item.source}-${item.id}`}
                type="button"
                onClick={() => toggle(item.id)}
                data-testid={`from-zero-ref-${item.id}`}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-lg border bg-[var(--surface-raised)]",
                  isSelected
                    ? "border-[var(--accent-primary)] ring-2 ring-[var(--accent-primary)]"
                    : "border-[var(--border-dim)]"
                )}
              >
                {item.url ? (
                  <Image
                    src={item.url}
                    alt={item.label}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-[var(--text-muted)]">
                    <ImageIcon className="size-5" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="mt-3 text-xs text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="mt-4"
        disabled={!canContinue}
        onClick={() => void handleContinue()}
        data-testid="from-zero-continue-references"
      >
        {t("continue")}
      </Button>
    </div>
  );
}

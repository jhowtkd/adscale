"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImageIcon, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadChatAttachment } from "@/lib/assistant/chat-attachments";
import { useWorkspaceAssets } from "@/lib/hooks/use-workspace-assets";
import { useGuidedFlowCommand } from "@/lib/hooks/use-guided-flow-commands";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";
import { cn } from "@/lib/utils";

export interface ExistingCreativeSelectPanelProps {
  threadId: string;
  guidedFlow: GuidedFlow;
}

export default function ExistingCreativeSelectPanel({
  threadId,
  guidedFlow,
}: ExistingCreativeSelectPanelProps) {
  const t = useTranslations("assistant.guidedFlow.existingCreative");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { data, isLoading } = useWorkspaceAssets({ limit: 12 });
  const selectCreative = useGuidedFlowCommand(threadId);

  const assets = data?.assets ?? [];

  const handleFile = async (file: File) => {
    setError(null);
    setIsUploading(true);
    try {
      const uploaded = await uploadChatAttachment(file);
      await handlePick(uploaded.assetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setIsUploading(false);
    }
  };

  const handlePick = async (workspaceAssetId: string) => {
    setError(null);
    try {
      await selectCreative.mutateAsync({
        commandId: crypto.randomUUID(),
        expectedRevision: guidedFlow.revision ?? 0,
        command: { type: "select_creative", workspaceAssetId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("selectFailed"));
    }
  };

  const busy = selectCreative.isPending || isUploading;

  return (
    <div
      className="mx-4 mt-2 rounded-xl border border-[var(--border-dim)] bg-[var(--surface-raised)] p-4"
      data-testid="existing-creative-select-panel"
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">{t("title")}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t("subtitle")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          data-testid="existing-creative-upload"
        >
          {busy ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="mr-2 size-4" aria-hidden="true" />
          )}
          {isUploading ? t("uploading") : t("upload")}
        </Button>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-[var(--text-secondary)]">
          {t("libraryHeading")}
        </p>
        {isLoading ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t("loading")}</p>
        ) : assets.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t("emptyLibrary")}</p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                disabled={busy}
                onClick={() => void handlePick(asset.id)}
                data-testid={`existing-creative-asset-${asset.id}`}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-lg border border-[var(--border-dim)] bg-[var(--surface-inset)]",
                  "hover:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]",
                  busy && "pointer-events-none opacity-50"
                )}
              >
                {asset.url ? (
                  <Image
                    src={asset.url}
                    alt={asset.name}
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
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-3 space-y-2" role="alert">
          <p className="text-xs text-[var(--danger-text)]">{error}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setError(null)}
            data-testid="retry-creative-select"
          >
            {t("retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

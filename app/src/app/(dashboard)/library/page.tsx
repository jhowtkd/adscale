"use client";

import Image from "next/image";
import { useReducer, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, Upload, Trash2, Tag, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import PageFrame from "@/components/layout/PageFrame";
import PageHeader from "@/components/layout/PageHeader";
import Panel from "@/components/layout/Panel";
import {
  useWorkspaceAssets,
  useDeleteWorkspaceAsset,
  type WorkspaceAsset,
} from "@/lib/hooks/use-workspace-assets";
import { useQueryClient } from "@tanstack/react-query";

interface LibraryState {
  search: string;
  debouncedSearch: string;
  isUploading: boolean;
  uploadProgress: number;
  dragOver: boolean;
  deleteTarget: { id: string; name: string } | null;
}

const initialLibraryState: LibraryState = {
  search: "",
  debouncedSearch: "",
  isUploading: false,
  uploadProgress: 0,
  dragOver: false,
  deleteTarget: null,
};

function libraryReducer(state: LibraryState, payload: Partial<LibraryState>): LibraryState {
  return { ...state, ...payload };
}

export default function LibraryPage() {
  const t = useTranslations("library");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [state, updateState] = useReducer(libraryReducer, initialLibraryState);
  const { search, debouncedSearch, isUploading, uploadProgress, dragOver, deleteTarget } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const { data, isLoading } = useWorkspaceAssets({ q: debouncedSearch || undefined });
  const deleteAsset = useDeleteWorkspaceAsset();

  const handleSearch = (value: string) => {
    updateState({ search: value });
    setTimeout(() => updateState({ debouncedSearch: value }), 300);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset.mutateAsync(deleteTarget.id);
      updateState({ deleteTarget: null });
    } catch {
      // Error handled by hook toast
    }
  };

  const handleUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    updateState({ isUploading: true, uploadProgress: 0 });

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        updateState({ uploadProgress: Math.round((e.loaded / e.total) * 100) });
      }
    });

    xhr.addEventListener("load", () => {
      updateState({ isUploading: false, uploadProgress: 0 });
      xhrRef.current = null;
      if (xhr.status === 201) {
        queryClient.invalidateQueries({ queryKey: ["workspace-assets"] });
      }
    });

    xhr.addEventListener("error", () => {
      updateState({ isUploading: false, uploadProgress: 0 });
      xhrRef.current = null;
    });

    xhr.addEventListener("abort", () => {
      updateState({ isUploading: false, uploadProgress: 0 });
      xhrRef.current = null;
    });

    xhr.open("POST", "/api/workspace/assets");
    xhr.send(formData);
  }, [queryClient]);

  useEffect(() => {
    const xhrStore = xhrRef;
    return () => {
      if (xhrStore.current) {
        xhrStore.current.abort();
      }
    };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    updateState({ dragOver: false });
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }, [handleUpload]);

  return (
    <PageFrame width="operational" className="min-w-0 space-y-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              aria-label={t("uploadAriaLabel")}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload size={16} aria-hidden="true" />
              {isUploading ? `${uploadProgress}%` : t("upload")}
            </Button>
          </>
        }
      />

      <Panel>
        <button
          type="button"
          onDragOver={(e) => {
            e.preventDefault();
            updateState({ dragOver: true });
          }}
          onDragLeave={() => updateState({ dragOver: false })}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-[var(--border-dim)] bg-[var(--surface-base)]"
          }`}
        >
          <Upload size={32} className="mx-auto mb-3 text-[var(--text-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--text-secondary)]">{t("dropzoneLabel")}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("dropzoneHint")}</p>
        </button>

        <div className="relative border-t border-[var(--border-dim)] p-4">
          <Search size={16} className="absolute left-7 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="border-[var(--border-dim)] bg-[var(--surface-base)] pl-9"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-lg border border-[var(--border-dim)] bg-[var(--surface-raised)]"
              />
            ))}
          </div>
        ) : data?.assets && data.assets.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4 lg:grid-cols-6">
            {data.assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onDelete={() => updateState({ deleteTarget: { id: asset.id, name: asset.name } })}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ImageIcon}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              debouncedSearch
                ? {
                    label: tCommon("clearFilters"),
                    onClick: () => handleSearch(""),
                  }
                : {
                    label: t("upload"),
                    onClick: () => fileInputRef.current?.click(),
                    icon: Upload,
                  }
            }
          />
        )}
      </Panel>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && updateState({ deleteTarget: null })}
        title={t("deleteConfirmTitle")}
        description={
          deleteTarget?.name
            ? t("deleteConfirmDescription", { name: deleteTarget.name })
            : t("deleteConfirm")
        }
        confirmLabel={t("deleteConfirm")}
        cancelLabel={tCommon("cancel")}
        variant="destructive"
        isLoading={deleteAsset.isPending}
        onConfirm={handleDelete}
      />
    </PageFrame>
  );
}

function AssetCard({
  asset,
  onDelete,
}: {
  asset: WorkspaceAsset;
  onDelete: () => void;
}) {
  const imageUrl = asset.url;

  return (
    <div className="group relative bg-[var(--surface-raised)] border border-[var(--border-dim)] rounded-lg overflow-hidden hover:border-[var(--border-medium)] transition-all">
      {/* Image */}
      <div className="aspect-square relative">
        <Image
          src={imageUrl}
          alt={asset.name}
          className="size-full object-cover"
          loading="lazy"
        
        width={800}
        height={800}
        unoptimized
      />
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="destructive"
            onClick={onDelete}
            className="size-8 p-0"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {asset.name}
        </p>
        {asset.aiDescription && (
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
            {asset.aiDescription}
          </p>
        )}
        {asset.tags && asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {asset.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="neutral" className="text-[10px] gap-1 px-1.5 py-0.5">
                <Tag size={10} aria-hidden="true" />
                {tag}
              </Badge>
            ))}
            {asset.tags.length > 3 && (
              <span className="text-xs text-[var(--text-muted)]">
                +{asset.tags.length - 3}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>{asset.width ?? "?"}×{asset.height ?? "?"}</span>
          <span>•</span>
          <span>{(asset.size / 1024).toFixed(0)} KB</span>
        </div>
      </div>
    </div>
  );
}

"use client";

import Image from "next/image";
import { useReducer, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, Upload, ImageIcon, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            aria-label="Upload library asset"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)]"
          >
            <Upload size={16} className="mr-2" />
            {isUploading ? `${uploadProgress}%` : t("upload")}
          </Button>
        </div>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); updateState({ dragOver: true }); }}
        onDragLeave={() => updateState({ dragOver: false })}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragOver
            ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/5"
            : "border-[var(--border-dim)] bg-[var(--surface-base)]"
        }`}
      >
        <Upload size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-secondary)]">
          Arraste e solte imagens aqui ou clique em Upload
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          PNG, JPEG, WebP • Máx 50MB
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-9 bg-[var(--surface-base)] border-[var(--border-dim)]"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="bg-[var(--surface-raised)] border border-[var(--border-dim)] rounded-lg aspect-square animate-pulse"
            />
          ))}
        </div>
      ) : data?.assets && data.assets.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {data.assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onDelete={() => updateState({ deleteTarget: { id: asset.id, name: asset.name } })} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--text-muted)]">
          <ImageIcon size={48} className="mb-4 opacity-50" />
          <p className="text-lg font-medium">{t("emptyTitle")}</p>
          <p className="text-sm mt-1">{t("emptyDescription")}</p>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && updateState({ deleteTarget: null })}
        title={t("deleteConfirmTitle") || "Confirmar exclusão"}
        description={
          deleteTarget?.name
            ? (t("deleteConfirmDescription", { name: deleteTarget.name }) ||
              `Tem certeza que deseja excluir "${deleteTarget.name}"? Esta ação não pode ser desfeita.`)
            : "Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita."
        }
        confirmLabel={t("deleteConfirm")}
        cancelLabel={tCommon("cancel")}
        variant="destructive"
        isLoading={deleteAsset.isPending}
        onConfirm={handleDelete}
      />
    </div>
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
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--surface-base)] text-[var(--text-secondary)]"
              >
                <Tag size={8} />
                {tag}
              </span>
            ))}
            {asset.tags.length > 3 && (
              <span className="text-[10px] text-[var(--text-muted)]">
                +{asset.tags.length - 3}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
          <span>{asset.width ?? "?"}×{asset.height ?? "?"}</span>
          <span>•</span>
          <span>{(asset.size / 1024).toFixed(0)} KB</span>
        </div>
      </div>
    </div>
  );
}

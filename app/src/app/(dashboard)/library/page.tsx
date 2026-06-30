"use client";

import { useReducer, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Upload, ImageIcon } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import {
  useWorkspaceAssets,
  useDeleteWorkspaceAsset,
} from "@/lib/hooks/use-workspace-assets";
import { useQueryClient } from "@tanstack/react-query";
import LibraryV6View from "@/components/library/v6/LibraryV6View";
import { buildLibraryV6Labels } from "@/components/library/v6/build-library-v6-labels";
import { mapWorkspaceAssetToV6 } from "@/components/library/v6/map-library-v6";

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

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
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
  const labels = useMemo(() => buildLibraryV6Labels(t), [t]);

  const assets = useMemo(
    () => (data?.assets ?? []).map((asset, index) => mapWorkspaceAssetToV6(asset, index, formatSize)),
    [data?.assets],
  );

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

  const handleUpload = useCallback(
    async (file: File) => {
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
    },
    [queryClient],
  );

  useEffect(() => {
    const xhrStore = xhrRef;
    return () => {
      if (xhrStore.current) {
        xhrStore.current.abort();
      }
    };
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      updateState({ dragOver: false });
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = "";
    },
    [handleUpload],
  );

  const emptyState =
    !isLoading && assets.length === 0 ? (
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
    ) : undefined;

  return (
    <div className="pb-10">
      <input
        ref={fileInputRef}
        type="file"
        aria-label={t("uploadAriaLabel")}
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      <LibraryV6View
        labels={labels}
        assets={assets}
        shownCount={assets.length}
        totalCount={assets.length}
        isLoading={isLoading}
        searchQuery={search}
        onSearchChange={handleSearch}
        dragOver={dragOver}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        onDropzoneClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          updateState({ dragOver: true });
        }}
        onDragLeave={() => updateState({ dragOver: false })}
        onDrop={handleDrop}
        onUploadClick={() => fileInputRef.current?.click()}
        onDeleteAsset={(id, name) => updateState({ deleteTarget: { id, name } })}
        emptyState={emptyState}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && updateState({ deleteTarget: null })}
        title={t("deleteConfirmTitle")}
        description={
          deleteTarget?.name
            ? t("deleteConfirmDescription", { name: deleteTarget.name })
            : t("deleteConfirm")
        }
        confirmLabel={t("deleteConfirmTitle")}
        cancelLabel={tCommon("cancel")}
        variant="destructive"
        isLoading={deleteAsset.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

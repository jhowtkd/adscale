"use client";

import { useReducer, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, ImageIcon } from "lucide-react";
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
import { useLibraryFavorites, type LibraryFavoriteItem } from "@/lib/hooks/use-piece-favorite";
import type { LibraryV6Filter } from "@/components/library/v6/library-v6-types";
import { pickSurfaceGradient } from "@/lib/v6-surface-gradients";

const PAGE_SIZE = 24;
const MAX_LIMIT = 200;

interface LibraryState {
  search: string;
  debouncedSearch: string;
  limit: number;
  isUploading: boolean;
  uploadProgress: number;
  dragOver: boolean;
  deleteTarget: { id: string; name: string } | null;
  filter: LibraryV6Filter;
}

const initialLibraryState: LibraryState = {
  search: "",
  debouncedSearch: "",
  limit: PAGE_SIZE,
  isUploading: false,
  uploadProgress: 0,
  dragOver: false,
  deleteTarget: null,
  filter: "all",
};

function libraryReducer(state: LibraryState, payload: Partial<LibraryState>): LibraryState {
  return { ...state, ...payload };
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function mapFavoriteToV6(item: LibraryFavoriteItem, index: number) {
  return {
    id: item.outputId,
    name: item.name,
    tags: ["favorite"],
    sizeLabel: "—",
    dimensionsLabel: "—",
    aspectRatioLabel: "—",
    source: "favorite",
    createdAtLabel: new Date(item.createdAt).toLocaleDateString(),
    kind: "generated" as const,
    imageUrl: item.downloadHref,
    glyph: item.name.slice(0, 4).toUpperCase(),
    gradient: pickSurfaceGradient(index),
  };
}

export default function LibraryPage() {
  const t = useTranslations("library");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [state, updateState] = useReducer(libraryReducer, initialLibraryState);
  const { search, debouncedSearch, limit, isUploading, uploadProgress, dragOver, deleteTarget, filter } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, isFetching, isError } = useWorkspaceAssets({
    q: debouncedSearch || undefined,
    limit,
    excludeSources: ["curated_inspiration", "curated_inspiration_copy"],
  });
  const deleteAsset = useDeleteWorkspaceAsset();
  const favoritesQuery = useLibraryFavorites(filter === "favorite");
  const labels = useMemo(() => buildLibraryV6Labels(t), [t]);

  const assets = useMemo(
    () => (data?.assets ?? []).map((asset, index) => mapWorkspaceAssetToV6(asset, index, formatSize, (date) => new Date(date).toLocaleDateString())),
    [data?.assets],
  );
  const favoriteAssets = useMemo(
    () => (favoritesQuery.data ?? []).map((item, index) => mapFavoriteToV6(item, index)),
    [favoritesQuery.data],
  );
  const visibleAssets = useMemo(() => {
    if (filter === "favorite") return favoriteAssets;
    return filter === "all" ? assets : assets.filter((asset) => asset.kind === filter);
  }, [assets, favoriteAssets, filter]);
  const totalCount = filter === "favorite"
    ? favoriteAssets.length
    : filter === "all" ? data?.total ?? assets.length : visibleAssets.length;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearch = (value: string) => {
    updateState({ search: value, limit: PAGE_SIZE });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateState({ debouncedSearch: value }), 300);
  };

  const handleLoadMore = () => {
    updateState({ limit: Math.min(limit + PAGE_SIZE, MAX_LIMIT) });
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
        } else {
          const message = (() => {
            try {
              return JSON.parse(xhr.responseText)?.error;
            } catch {
              return undefined;
            }
          })();
          toast.error(message || tCommon("error"));
        }
      });

      xhr.addEventListener("error", () => {
        updateState({ isUploading: false, uploadProgress: 0 });
        xhrRef.current = null;
        toast.error(tCommon("error"));
      });

      xhr.addEventListener("abort", () => {
        updateState({ isUploading: false, uploadProgress: 0 });
        xhrRef.current = null;
      });

      xhr.open("POST", "/api/workspace/assets");
      xhr.send(formData);
    },
    [queryClient, tCommon],
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

  const emptyState = isError && filter !== "favorite" ? (
    <EmptyState
      icon={AlertCircle}
      title={t("errorTitle")}
      description={t("errorDescription")}
      action={{
        label: tCommon("retry"),
        onClick: () => queryClient.invalidateQueries({ queryKey: ["workspace-assets"] }),
      }}
    />
  ) : filter === "favorite" && !favoritesQuery.isLoading && favoriteAssets.length === 0 ? (
    <EmptyState
      icon={ImageIcon}
      title={t("v6.favoritesEmptyTitle")}
      description={t("v6.favoritesEmptyDescription")}
    />
  ) : !isLoading && visibleAssets.length === 0 && (debouncedSearch || filter !== "all") ? (
    <EmptyState
      icon={ImageIcon}
      title={t("emptyTitle")}
      description={t("emptyDescription")}
      action={{
        label: tCommon("clear"),
        onClick: () => {
          handleSearch("");
          updateState({ filter: "all", limit: PAGE_SIZE });
        },
      }}
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
        assets={visibleAssets}
        shownCount={visibleAssets.length}
        totalCount={totalCount}
        isLoading={filter === "favorite" ? favoritesQuery.isLoading : isLoading}
        searchQuery={search}
        onSearchChange={handleSearch}
        activeFilter={filter}
        onFilterChange={(value) => updateState({ filter: value, limit: value === "all" ? PAGE_SIZE : MAX_LIMIT })}
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
        onDeleteAsset={filter === "favorite" ? undefined : (id, name) => updateState({ deleteTarget: { id, name } })}
        onReplaceAsset={() => fileInputRef.current?.click()}
        emptyState={emptyState}
        onLoadMore={handleLoadMore}
        isLoadingMore={isFetching && !isLoading}
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
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        variant="destructive"
        isLoading={deleteAsset.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}

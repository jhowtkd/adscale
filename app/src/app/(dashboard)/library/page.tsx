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
import { useLibraryFavorites, useSetPieceFavorite, type LibraryFavoriteItem } from "@/lib/hooks/use-piece-favorite";
import type { LibraryV6Filter } from "@/components/library/v6/library-v6-types";
import { pickSurfaceGradient } from "@/lib/v6-surface-gradients";
import { useBrandKit } from "@/lib/hooks/use-brand-kit";
import { useActiveClientProfile } from "@/lib/hooks/use-active-client-profile";
import { useEquipeAccounts, useEquipeAccountState } from "@/lib/equipe/use-equipe";

const PAGE_SIZE = 24;

interface LibraryState {
  search: string;
  debouncedSearch: string;
  limit: number;
  isUploading: boolean;
  uploadProgress: number;
  dragOver: boolean;
  deleteTarget: { id: string; name: string } | null;
  filter: LibraryV6Filter;
  origin: string;
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
  origin: "all",
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
  const tComposer = useTranslations("dashboard.home.composer.results");
  const queryClient = useQueryClient();
  const [state, updateState] = useReducer(libraryReducer, initialLibraryState);
  const { search, debouncedSearch, limit, isUploading, uploadProgress, dragOver, deleteTarget, filter } = state;
  const active = useActiveClientProfile();
  const { activeClientProfileId, activeProfile } = active;
  const accountsQuery = useEquipeAccounts();
  const accountId = accountsQuery.data?.accounts.find(account => account.clientProfileId === activeClientProfileId)?.id ?? null;
  const accountQuery = useEquipeAccountState(accountId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, isFetching, isError, fetchNextPage } = useWorkspaceAssets({
    clientProfileId: activeClientProfileId ?? undefined,
    enabled: Boolean(activeClientProfileId) && !["identity", "documents", "favorite"].includes(filter),
    source: state.origin !== "all" ? state.origin : undefined,
    kind: filter === "identity" || filter === "images" || filter === "post" || filter === "page" ? filter : undefined,
    q: debouncedSearch || undefined,
    limit,
    excludeSources: ["curated_inspiration", "curated_inspiration_copy"],
  });
  const deleteAsset = useDeleteWorkspaceAsset();
  const identityAssetsQuery = useWorkspaceAssets({
    clientProfileId: activeClientProfileId ?? undefined,
    enabled: Boolean(activeClientProfileId) && ["all", "identity"].includes(filter),
    kind: "identity",
    limit: 1,
  });
  const brandKitQuery = useBrandKit(activeClientProfileId ?? undefined, { enabled: Boolean(activeClientProfileId) && Boolean(activeProfile?.logoAssetKey) && ["all", "identity"].includes(filter) });
  const legacyLogoUrl = brandKitQuery.data?.id === activeClientProfileId && brandKitQuery.data.logoAssetKey === activeProfile?.logoAssetKey ? brandKitQuery.data.logoUrl : undefined;
  const logoAsset = activeProfile?.logoAssetKey ? identityAssetsQuery.data?.assets.find(asset => asset.key === activeProfile.logoAssetKey) : undefined;
  const favoritesQuery = useLibraryFavorites(filter === "favorite" && Boolean(activeClientProfileId), activeClientProfileId ?? undefined);
  const setFavorite = useSetPieceFavorite();
  const labels = useMemo(() => buildLibraryV6Labels(t), [t]);

  const assets = useMemo(
    () => (activeClientProfileId ? data?.assets ?? [] : []).filter(asset => asset.type.startsWith("image/") || asset.type === "image" || asset.metadata?.kind === "site_page").map((asset, index) => mapWorkspaceAssetToV6(asset, index, formatSize, (date) => new Date(date).toLocaleDateString(), activeProfile?.logoAssetKey)),
    [data?.assets, activeClientProfileId, activeProfile?.logoAssetKey],
  );
  const favoriteAssets = useMemo(
    () => (favoritesQuery.data ?? []).map((item, index) => mapFavoriteToV6(item, index)),
    [favoritesQuery.data],
  );
  const visibleAssets = useMemo(() => {
    if (filter === "favorite") return favoriteAssets.filter((asset) =>
      asset.name.toLocaleLowerCase().includes(debouncedSearch.trim().toLocaleLowerCase()),
    );
    if (filter === "documents") return [];
    if (filter === "identity") return assets.filter(asset => asset.kind === "logo");
    if (filter === "images") return assets.filter(asset => !["logo", "post", "page"].includes(asset.kind));
    return filter === "all" ? assets : assets.filter((asset) => asset.kind === filter);
  }, [assets, favoriteAssets, filter, debouncedSearch]);
  const totalCount = filter === "favorite"
    ? visibleAssets.length
    : ["identity", "documents"].includes(filter) ? 0 : data?.total ?? visibleAssets.length;
  const documents = (accountQuery.data?.documents ?? []).filter(document => document.clientProfileId === activeClientProfileId);
  const identity = accountQuery.data?.handoff?.step === "done" ? accountQuery.data.handoff.decisions.identity : undefined;

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
    void fetchNextPage();
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
      if (!file.type.startsWith("image/") || !activeClientProfileId) return;
      updateState({ isUploading: true, uploadProgress: 0 });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientProfileId", activeClientProfileId);

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
    [queryClient, tCommon, activeClientProfileId],
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

  const emptyState = (filter === "favorite" ? favoritesQuery.isError : filter === "documents" ? accountQuery.isError : isError) ? (
    <EmptyState
      icon={AlertCircle}
      title={t("errorTitle")}
      description={t("errorDescription")}
      action={{
        label: tCommon("retry"),
        onClick: () => filter === "favorite"
          ? void favoritesQuery.refetch()
          : filter === "documents" ? void accountQuery.refetch()
          : void queryClient.invalidateQueries({ queryKey: ["workspace-assets"] }),
      }}
    />
  ) : filter === "favorite" && !favoritesQuery.isLoading && favoriteAssets.length === 0 ? (
    <EmptyState
      icon={ImageIcon}
      title={t("v6.favoritesEmptyTitle")}
      description={t("v6.favoritesEmptyDescription")}
    />
  ) : !isLoading && visibleAssets.length === 0 && !["documents", "identity"].includes(filter) && (debouncedSearch || filter !== "all") ? (
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
        profile={activeProfile}
        logoImageUrl={logoAsset?.type.startsWith("image") ? logoAsset.url : legacyLogoUrl ?? undefined}
        brandLabels={t.raw("brand") as Record<string, string>}
        documents={debouncedSearch ? documents.filter(document => JSON.stringify(document.content).toLocaleLowerCase().includes(debouncedSearch.toLocaleLowerCase())) : documents}
        originFilter={state.origin}
        onOriginChange={value => updateState({ origin: value, limit: PAGE_SIZE })}
        identityOrigins={identity ? { logo: identity.logo?.origin, colors: identity.colors.map(item => item.origin), fonts: identity.fonts.map(item => item.origin) } : undefined}
        labels={labels}
        assets={visibleAssets}
        shownCount={filter === "favorite" ? visibleAssets.length : data?.assets.length ?? 0}
        totalCount={totalCount}
        isLoading={active.isLoading || (filter === "favorite" ? favoritesQuery.isLoading : filter === "documents" ? accountsQuery.isLoading || accountQuery.isLoading : isLoading)}
        searchQuery={search}
        onSearchChange={handleSearch}
        activeFilter={filter}
        onFilterChange={(value) => updateState({ filter: value, limit: PAGE_SIZE })}
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
        onReplaceAsset={filter === "favorite" ? undefined : () => fileInputRef.current?.click()}
        renderAssetActions={filter === "favorite" ? (asset) => {
          const item = favoritesQuery.data?.find((entry) => entry.outputId === asset.id);
          if (!item) return null;
          return (
            <div className="flex flex-wrap gap-3 px-2 py-2 text-sm">
              <a href={item.downloadHref} className="underline focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{tComposer("download")}</a>
              <button
                type="button"
                disabled={setFavorite.isPending}
                onClick={() => setFavorite.mutate({ workId: item.workItemId, outputId: item.outputId, next: false })}
                className="underline focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
              >{tComposer("unfavorite")}</button>
            </div>
          );
        } : undefined}
        emptyState={!active.isLoading && !activeClientProfileId ? <p className="py-10 text-sm text-[var(--text-secondary)]">{t("brand.selectBrand")}</p> : emptyState}
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

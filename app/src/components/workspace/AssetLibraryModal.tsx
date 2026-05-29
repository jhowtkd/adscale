"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, ImageIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useWorkspaceAssets,
  type WorkspaceAsset,
} from "@/lib/hooks/use-workspace-assets";

interface AssetLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: WorkspaceAsset) => void;
}

export default function AssetLibraryModal({
  open,
  onOpenChange,
  onSelect,
}: AssetLibraryModalProps) {
  const t = useTranslations("library");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useWorkspaceAssets({
    q: search || undefined,
    limit: 24,
  });

  const selectedAsset = data?.assets.find((a) => a.id === selectedId) ?? null;

  const handleConfirm = () => {
    if (selectedAsset) {
      onSelect(selectedAsset);
      onOpenChange(false);
      setSelectedId(null);
      setSearch("");
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setSelectedId(null);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon size={18} />
            {t("chooseFromLibrary")}
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative mt-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto min-h-[300px] mt-4">
          {isLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-[var(--surface-raised)] animate-pulse" />
              ))}
            </div>
          ) : data?.assets && data.assets.length > 0 ? (
            <div className="grid grid-cols-4 gap-3">
              {data.assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => setSelectedId(asset.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selectedId === asset.id
                      ? "border-[var(--accent-green)] ring-2 ring-[var(--accent-green)]/20"
                      : "border-transparent hover:border-[var(--border-medium)]"
                  }`}
                >
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedId === asset.id && (
                    <div className="absolute inset-0 bg-[var(--accent-green)]/20 flex items-center justify-center">
                      <div className="bg-[var(--accent-green)] text-white rounded-full p-1">
                        <Check size={16} />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-xs text-white truncate">{asset.name}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
              <ImageIcon size={32} className="mb-2 opacity-50" />
              <p className="text-sm">{t("emptyTitle")}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[var(--border-dim)]">
          <Button variant="outline" onClick={handleCancel}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedAsset}
            className="bg-[var(--accent-green)] text-white hover:bg-[var(--accent-green-light)]"
          >
            {t("useAsset")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

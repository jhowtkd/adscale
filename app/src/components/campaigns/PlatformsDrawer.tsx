"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_PLATFORM_OPTIONS,
  type CampaignPlatformOption,
} from "@/lib/campaign-platforms";

const PLATFORM_I18N_KEYS: Record<CampaignPlatformOption, string> = {
  "Meta Feed": "metaFeed",
  "Meta Stories": "metaStories",
  "Google Display": "googleDisplay",
  TikTok: "tiktok",
  LinkedIn: "linkedin",
};

export interface PlatformsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlatforms?: string[];
  isSaving?: boolean;
  onSave: (platforms: string[]) => void | Promise<void>;
}

function toSelectionRecord(platforms: string[]): Record<CampaignPlatformOption, boolean> {
  const selected = new Set(platforms);
  return CAMPAIGN_PLATFORM_OPTIONS.reduce(
    (acc, option) => {
      acc[option] = selected.has(option);
      return acc;
    },
    {} as Record<CampaignPlatformOption, boolean>
  );
}

export default function PlatformsDrawer({
  open,
  onOpenChange,
  selectedPlatforms = [],
  isSaving = false,
  onSave,
}: PlatformsDrawerProps) {
  const t = useTranslations("common.platformsDrawer");
  const tc = useTranslations("common");
  const [selected, setSelected] = useState<Record<CampaignPlatformOption, boolean>>(
    () => toSelectionRecord(selectedPlatforms)
  );

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setSelected(toSelectionRecord(selectedPlatforms));
      });
    }
  }, [open, selectedPlatforms]);

  const togglePlatform = useCallback((platform: CampaignPlatformOption) => {
    setSelected((prev) => ({ ...prev, [platform]: !prev[platform] }));
  }, []);

  const handleSave = useCallback(() => {
    const platforms = CAMPAIGN_PLATFORM_OPTIONS.filter((option) => selected[option]);
    void onSave(platforms);
  }, [onSave, selected]);

  const hasSelection = CAMPAIGN_PLATFORM_OPTIONS.some((option) => selected[option]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2">
          {CAMPAIGN_PLATFORM_OPTIONS.map((platform) => {
            const checked = selected[platform];
            const inputId = `platform-${PLATFORM_I18N_KEYS[platform]}`;

            return (
              <label
                key={platform}
                htmlFor={inputId}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  checked
                    ? "border-[var(--accent-green)]/40 bg-[var(--accent-green)]/5"
                    : "border-[var(--border-dim)] bg-[var(--surface-base)] hover:bg-[var(--surface-raised)]"
                )}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePlatform(platform)}
                  className="size-4 accent-[var(--accent-green)]"
                />
                <span className="text-sm text-[var(--text-primary)]">
                  {t(PLATFORM_I18N_KEYS[platform])}
                </span>
              </label>
            );
          })}
        </DialogBody>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {tc("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasSelection}
          >
            {isSaving ? tc("loading") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

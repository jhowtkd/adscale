"use client";

import { Search, X, List, LayoutGrid, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Toolbar from "@/components/layout/Toolbar";
import { useTranslations } from "next-intl";
import type { ViewMode, SortOption, StatusFilter, PlatformFilter } from "./types";
import {
  getPlatformFilterLabel,
  getSortFilterLabel,
  getStatusFilterLabel,
} from "./filter-labels";

interface ActiveFilter {
  label: string;
  onRemove: () => void;
}

interface CampaignsFilterToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusChange: (value: StatusFilter) => void;
  platformFilter: PlatformFilter;
  onPlatformChange: (value: PlatformFilter) => void;
  sortOption: SortOption;
  onSortChange: (value: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  activeFilters: ActiveFilter[];
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  className?: string;
}

export default function CampaignsFilterToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  platformFilter,
  onPlatformChange,
  sortOption,
  onSortChange,
  viewMode,
  onViewModeChange,
  activeFilters,
  hasActiveFilters,
  onClearFilters,
  className,
}: CampaignsFilterToolbarProps) {
  const t = useTranslations("campaign");
  const tc = useTranslations("common");

  const statusLabel = getStatusFilterLabel(statusFilter, t, tc);
  const platformLabel = getPlatformFilterLabel(platformFilter, t, tc);
  const sortLabel = getSortFilterLabel(sortOption, tc);

  return (
    <div className={className}>
      <Toolbar>
        <div className="flex w-full flex-col gap-2.5 lg:flex-row lg:items-end">
          <div className="relative w-full lg:max-w-[300px]">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="h-8 w-full border-[var(--border-dim)] bg-[var(--surface-raised)] pl-9 pr-8 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label={tc("clearSearch")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {tc("status")}
              </span>
              <Select
                value={statusFilter}
                onValueChange={(v) => onStatusChange(v as StatusFilter)}
              >
                <SelectTrigger
                  aria-label={`${tc("status")}: ${statusLabel}`}
                  className="h-8 w-[148px] border-[var(--border-dim)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)]"
                >
                  <SelectValue>{statusLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent className="border-[var(--border-dim)] bg-[var(--surface-raised)]">
                  <SelectItem value="all" className="text-xs text-[var(--text-primary)]">{tc("allStatus")}</SelectItem>
                  <SelectItem value="draft" className="text-xs text-[var(--text-primary)]">{t("status.draft")}</SelectItem>
                  <SelectItem value="active" className="text-xs text-[var(--text-primary)]">{t("status.active")}</SelectItem>
                  <SelectItem value="generating" className="text-xs text-[var(--text-primary)]">{t("status.generating")}</SelectItem>
                  <SelectItem value="completed" className="text-xs text-[var(--text-primary)]">{t("status.completed")}</SelectItem>
                  <SelectItem value="failed" className="text-xs text-[var(--text-primary)]">{t("status.failed")}</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {tc("platforms")}
              </span>
              <Select
                value={platformFilter}
                onValueChange={(v) => onPlatformChange(v as PlatformFilter)}
              >
                <SelectTrigger
                  aria-label={`${tc("platforms")}: ${platformLabel}`}
                  className="h-8 w-[156px] border-[var(--border-dim)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)]"
                >
                  <SelectValue>{platformLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent className="border-[var(--border-dim)] bg-[var(--surface-raised)]">
                  <SelectItem value="all" className="text-xs text-[var(--text-primary)]">{tc("allPlatforms")}</SelectItem>
                  <SelectItem value="Meta" className="text-xs text-[var(--text-primary)]">{t("platformNames.Meta")}</SelectItem>
                  <SelectItem value="TikTok" className="text-xs text-[var(--text-primary)]">{t("platformNames.TikTok")}</SelectItem>
                  <SelectItem value="Google" className="text-xs text-[var(--text-primary)]">{t("platformNames.Google")}</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {tc("sort")}
              </span>
              <Select
                value={sortOption}
                onValueChange={(v) => onSortChange(v as SortOption)}
              >
                <SelectTrigger
                  aria-label={`${tc("sort")}: ${sortLabel}`}
                  className="h-8 w-[148px] border-[var(--border-dim)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)]"
                >
                  <SelectValue>{sortLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent className="border-[var(--border-dim)] bg-[var(--surface-raised)]">
                  <SelectItem value="newest" className="text-xs text-[var(--text-primary)]">{tc("newest")}</SelectItem>
                  <SelectItem value="oldest" className="text-xs text-[var(--text-primary)]">{tc("oldest")}</SelectItem>
                  <SelectItem value="name-asc" className="text-xs text-[var(--text-primary)]">{tc("nameAsc")}</SelectItem>
                  <SelectItem value="name-desc" className="text-xs text-[var(--text-primary)]">{tc("nameDesc")}</SelectItem>
                  <SelectItem value="variations" className="text-xs text-[var(--text-primary)]">{tc("mostDerivations")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <div
            className="ml-auto flex items-center rounded-lg bg-[var(--surface-raised)] p-0.5"
            role="group"
            aria-label={t("viewModeLabel")}
          >
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              aria-label={t("viewList")}
              aria-pressed={viewMode === "list"}
              title={t("viewList")}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors duration-200",
                viewMode === "list"
                  ? "bg-[var(--surface-base)] text-[var(--accent-green-text)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              aria-label={t("viewGrid")}
              aria-pressed={viewMode === "grid"}
              title={t("viewGrid")}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors duration-200",
                viewMode === "grid"
                  ? "bg-[var(--surface-base)] text-[var(--accent-green-text)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("board")}
              aria-label={t("viewBoard")}
              aria-pressed={viewMode === "board"}
              title={t("viewBoard")}
              className={cn(
                "flex size-7 items-center justify-center rounded-md transition-colors duration-200",
                viewMode === "board"
                  ? "bg-[var(--surface-base)] text-[var(--accent-green-text)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              <Columns3 size={16} />
            </button>
          </div>
        </div>
      </Toolbar>

      {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-dim)] overflow-hidden transition-all duration-250">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              {tc("filters")}:
            </span>
            {activeFilters.map((filter) => (
              <span
                key={filter.label}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs px-2.5 py-1 border border-[var(--border-dim)]"
              >
                {filter.label}
                <button type="button"
                  onClick={filter.onRemove}
                  aria-label={tc("clear")}
                  className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button type="button"
              onClick={onClearFilters}
              className="text-xs text-[var(--accent-green)] hover:text-[var(--accent-green-light)] transition-colors ml-1"
            >
              {tc("clearAll")}
            </button>
          </div>
        )}
    </div>
  );
}

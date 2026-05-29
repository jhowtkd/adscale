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
import { useTranslations } from "next-intl";
import type { ViewMode, SortOption, StatusFilter, PlatformFilter } from "./types";

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
}: CampaignsFilterToolbarProps) {
  const t = useTranslations("campaign");
  const tc = useTranslations("common");

  return (
    <div className="rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-3">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
          {/* Search */}
          <div className="relative w-full lg:w-[280px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
            />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={tc("search")}
              aria-label={tc("search")}
              className="h-8 w-full pl-9 pr-8 bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <Select
              value={statusFilter}
              onValueChange={(v) => onStatusChange(v as StatusFilter)}
            >
              <SelectTrigger aria-label={tc("allStatus")} className="h-8 w-[140px] bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
                <SelectValue placeholder={tc("allStatus")} />
              </SelectTrigger>
              <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                <SelectItem value="all" className="text-[var(--text-primary)] text-xs">{tc("allStatus")}</SelectItem>
                <SelectItem value="draft" className="text-[var(--text-primary)] text-xs">{t("status.draft")}</SelectItem>
                <SelectItem value="active" className="text-[var(--text-primary)] text-xs">{t("status.active")}</SelectItem>
                <SelectItem value="generating" className="text-[var(--text-primary)] text-xs">{t("status.generating")}</SelectItem>
                <SelectItem value="completed" className="text-[var(--text-primary)] text-xs">{t("status.completed")}</SelectItem>
                <SelectItem value="failed" className="text-[var(--text-primary)] text-xs">{t("status.failed")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Platform Filter */}
            <Select
              value={platformFilter}
              onValueChange={(v) => onPlatformChange(v as PlatformFilter)}
            >
              <SelectTrigger aria-label={tc("allPlatforms")} className="h-8 w-[150px] bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
                <SelectValue placeholder={tc("allPlatforms")} />
              </SelectTrigger>
              <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                <SelectItem value="all" className="text-[var(--text-primary)] text-xs">{tc("allPlatforms")}</SelectItem>
                <SelectItem value="Meta" className="text-[var(--text-primary)] text-xs">{t("platformNames.Meta")}</SelectItem>
                <SelectItem value="TikTok" className="text-[var(--text-primary)] text-xs">{t("platformNames.TikTok")}</SelectItem>
                <SelectItem value="Google" className="text-[var(--text-primary)] text-xs">{t("platformNames.Google")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select
              value={sortOption}
              onValueChange={(v) => onSortChange(v as SortOption)}
            >
              <SelectTrigger aria-label={tc("sort")} className="h-8 w-[140px] bg-[var(--surface-raised)] border-[var(--border-dim)] text-[var(--text-primary)] text-xs">
                <SelectValue placeholder={tc("sort")} />
              </SelectTrigger>
              <SelectContent className="bg-[var(--surface-raised)] border-[var(--border-dim)]">
                <SelectItem value="newest" className="text-[var(--text-primary)] text-xs">{tc("newest")}</SelectItem>
                <SelectItem value="oldest" className="text-[var(--text-primary)] text-xs">{tc("oldest")}</SelectItem>
                <SelectItem value="name-asc" className="text-[var(--text-primary)] text-xs">{tc("nameAsc")}</SelectItem>
                <SelectItem value="name-desc" className="text-[var(--text-primary)] text-xs">{tc("nameDesc")}</SelectItem>
                <SelectItem value="variations" className="text-[var(--text-primary)] text-xs">{tc("mostDerivations")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View Toggle */}
          <div className="ml-auto flex items-center rounded-lg bg-[var(--surface-raised)] p-0.5">
            <button
              onClick={() => onViewModeChange("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-md transition-all duration-200",
                viewMode === "list"
                  ? "bg-[var(--surface-base)] text-[var(--accent-green)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <List size={16} />
            </button>
            <button
              onClick={() => onViewModeChange("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-md transition-all duration-200",
                viewMode === "grid"
                  ? "bg-[var(--surface-base)] text-[var(--accent-blue)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => onViewModeChange("board")}
              aria-label="Board view"
              aria-pressed={viewMode === "board"}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-md transition-all duration-200",
                viewMode === "board"
                  ? "bg-[var(--surface-base)] text-[var(--accent-green)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <Columns3 size={16} />
            </button>
          </div>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border-dim)] overflow-hidden transition-all duration-250">
            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
              {tc("filters")}:
            </span>
            {activeFilters.map((filter, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-raised)] text-[var(--text-secondary)] text-xs px-2.5 py-1 border border-[var(--border-dim)]"
              >
                {filter.label}
                <button
                  onClick={filter.onRemove}
                  aria-label={tc("clear")}
                  className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
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

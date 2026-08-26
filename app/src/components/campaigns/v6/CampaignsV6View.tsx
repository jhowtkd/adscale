"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PlatformFilter, SortOption, StatusFilter, ViewMode } from "@/components/campaigns/types";
import type {
  CampaignsV6Labels,
  CampaignV6BadgeVariant,
  CampaignV6Row,
  WorkOriginFilter,
} from "./campaigns-v6-types";

type CampaignsV6ViewProps = {
  labels: CampaignsV6Labels;
  rows: CampaignV6Row[];
  totalCount: number;
  isLoading?: boolean;
  interactive?: boolean;
  searchQuery: string;
  onSearchChange?: (value: string) => void;
  originFilter?: WorkOriginFilter;
  onOriginChange?: (value: WorkOriginFilter) => void;
  /** When false, hide status/platform/sort (list mode — they don't filter canonical rows). */
  showCampaignFilters?: boolean;
  statusFilter: StatusFilter;
  statusFilterLabel: string;
  onStatusChange?: (value: StatusFilter) => void;
  statusOptions: Array<{ value: StatusFilter; label: string }>;
  platformFilter: PlatformFilter;
  platformFilterLabel: string;
  onPlatformChange?: (value: PlatformFilter) => void;
  platformOptions: Array<{ value: PlatformFilter; label: string }>;
  sortOption: SortOption;
  sortLabel: string;
  onSortChange?: (value: SortOption) => void;
  sortOptions: Array<{ value: SortOption; label: string }>;
  viewMode: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, checked: boolean) => void;
  onNewCampaign?: () => void;
  onDuplicate?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSaveAsTemplate?: (campaign: CampaignV6Row["campaign"]) => void;
  alternateView?: ReactNode;
  emptyState?: ReactNode;
};

export default function CampaignsV6View({
  labels,
  rows,
  totalCount,
  isLoading = false,
  interactive = true,
  searchQuery,
  onSearchChange,
  originFilter = "all",
  onOriginChange,
  showCampaignFilters = true,
  statusFilter,
  statusFilterLabel,
  onStatusChange,
  statusOptions,
  platformFilter,
  platformFilterLabel,
  onPlatformChange,
  platformOptions,
  sortOption,
  sortLabel,
  onSortChange,
  sortOptions,
  viewMode,
  onViewModeChange,
  selectedIds = new Set(),
  onToggleSelect,
  onNewCampaign,
  onDuplicate,
  onArchive,
  onDelete,
  onSaveAsTemplate,
  alternateView,
  emptyState,
}: CampaignsV6ViewProps) {
  const title = isLoading ? "" : labels.formatTitle(totalCount);

  return (
    <div className="space-y-6" aria-busy={isLoading}>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded border border-[var(--border-default)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {labels.versionBadge}
            </span>
            <span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">{labels.sectionLabel}</span>
          </div>
          <h1 className="product-page-title text-[var(--text-primary)]">
            {isLoading ? (
              <span className="inline-block h-8 w-48 animate-pulse rounded bg-[var(--surface-raised)]" />
            ) : (
              title
            )}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">{labels.subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {showCampaignFilters ? (
            interactive && onSortChange ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  type="button"
                  className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)]"
                >
                  {labels.sortPrefix}: {sortLabel}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                  {sortOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => onSortChange(option.value)}
                      className={sortOption === option.value ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]" : undefined}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)]"
              >
                {labels.sortPrefix}: {sortLabel}
              </button>
            )
          ) : null}
          <button
            type="button"
            onClick={interactive ? onNewCampaign : undefined}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-medium text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            {labels.newWork ?? labels.newCampaign}
          </button>
          {interactive ? <Link href="/campaigns/new" className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{labels.newCampaign}</Link> : null}
        </div>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-base)]">
        <div
          className="flex flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] p-3"
          role="toolbar"
          aria-label={labels.filtersAria}
        >
          <div className="relative min-w-[220px] max-w-xs flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--utility-icon)]"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder={labels.searchPlaceholder}
              aria-label={labels.searchAriaLabel}
              value={searchQuery}
              onChange={interactive && onSearchChange ? (e) => onSearchChange(e.target.value) : undefined}
              readOnly={!interactive || !onSearchChange}
              className="w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {onOriginChange ? (
            <FilterChip
              interactive={interactive}
              label={
                originFilter === "campaign"
                  ? labels.originCampaigns
                  : originFilter === "creative_work"
                    ? labels.originPosts
                    : labels.originAll
              }
              count={String(totalCount)}
              options={[
                { value: "all" as const, label: labels.originAll },
                { value: "campaign" as const, label: labels.originCampaigns },
                { value: "creative_work" as const, label: labels.originPosts },
              ]}
              value={originFilter}
              onChange={onOriginChange}
            />
          ) : null}
          {showCampaignFilters ? (
            <>
              <FilterChip
                interactive={interactive}
                label={`${labels.statusChipPrefix}: ${statusFilterLabel}`}
                count={statusFilter === "all" ? String(totalCount) : undefined}
                options={statusOptions}
                value={statusFilter}
                onChange={onStatusChange}
              />
              <FilterChip
                interactive={interactive}
                label={`${labels.platformChipPrefix}: ${platformFilterLabel}`}
                options={platformOptions}
                value={platformFilter}
                onChange={onPlatformChange}
              />
            </>
          ) : null}

          {showCampaignFilters ? (
            <div className="ml-auto inline-flex rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-base)] p-0.5">
              <ViewToggle
                pressed={viewMode === "list"}
                label={labels.viewList}
                onClick={interactive && onViewModeChange ? () => onViewModeChange("list") : undefined}
              />
              <ViewToggle
                pressed={viewMode === "grid"}
                label={labels.viewGrid}
                onClick={interactive && onViewModeChange ? () => onViewModeChange("grid") : undefined}
              />
              {interactive && onViewModeChange ? (
                <ViewToggle
                  pressed={viewMode === "board"}
                  label={labels.viewBoard}
                  onClick={() => onViewModeChange("board")}
                  className="hidden lg:inline-flex"
                />
              ) : null}
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <ListSkeleton />
        ) : emptyState ? (
          <div className="p-6">{emptyState}</div>
        ) : viewMode === "list" ? (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {rows.map((row) => (
              <CampaignRow
                key={row.id}
                row={row}
                labels={labels}
                interactive={interactive}
                selected={selectedIds.has(row.id)}
                onToggleSelect={onToggleSelect}
                onDuplicate={onDuplicate}
                onArchive={onArchive}
                onDelete={onDelete}
                onSaveAsTemplate={onSaveAsTemplate}
              />
            ))}
          </ul>
        ) : viewMode === "grid" ? (
          <CampaignGrid rows={rows} labels={labels} interactive={interactive} />
        ) : (
          <div className="p-5">{alternateView}</div>
        )}
      </section>
    </div>
  );
}

function CampaignGrid({
  rows,
  labels,
  interactive,
}: {
  rows: CampaignV6Row[];
  labels: CampaignsV6Labels;
  interactive: boolean;
}) {
  return (
    <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <li key={row.id} className="min-w-0">
          <Link
            href={interactive ? row.href : "#"}
            aria-label={`${labels.openCampaign}: ${row.name}`}
            className="flex min-h-36 min-w-0 flex-col justify-between rounded-[var(--radius-object)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-colors hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            onClick={interactive ? undefined : (event) => event.preventDefault()}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className="grid h-10 w-10 place-items-center rounded-[var(--radius-control)] bg-[var(--neutral-bg)] text-xs font-bold text-[var(--neutral-text)]"
              >
                <WorkPreview key={row.previewHref ?? "missing"} row={row} labels={labels} />
              </span>
              <CampaignBadge variant={row.statusVariant} label={row.status} />
            </div>
            <div className="mt-6 min-w-0">
              <p className="truncate font-medium text-[var(--text-primary)]">{row.name}</p>
              <p className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                <span className="font-mono uppercase tracking-wide">{row.originLabel}</span>
                <span>{row.updated}</span>
              </p>
              <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                {row.brandName ?? row.originLabel}
                {row.protocol ? ` · ${row.protocol}` : ""}
                {row.resultCount !== undefined ? ` · ${row.resultCount} ${labels.resultsLabel ?? "resultados"}` : ""}
                {row.nextAction ? ` · ${row.nextAction}` : ""}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CampaignRow({
  row,
  labels,
  interactive,
  selected,
  onToggleSelect,
  onDuplicate,
  onArchive,
  onDelete,
  onSaveAsTemplate,
}: {
  row: CampaignV6Row;
  labels: CampaignsV6Labels;
  interactive: boolean;
  selected: boolean;
  onToggleSelect?: (id: string, checked: boolean) => void;
  onDuplicate?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSaveAsTemplate?: (campaign: CampaignV6Row["campaign"]) => void;
}) {
  const router = useRouter();

  const handleRowClick = () => {
    if (!interactive) return;
    router.push(row.href);
  };

  const isCampaign = row.originKind === "campaign";

  return (
    <li
      data-motion-highlight={selected ? "selected" : "idle"}
      data-selection-marker={selected ? "selected" : undefined}
      className={cn(
        "grid min-w-0 grid-cols-[auto_3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:px-4",
        "transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-product)]",
        selected
          ? "bg-[var(--selection-bg)] shadow-[inset_3px_0_0_var(--selection-border)]"
          : "hover:bg-[var(--surface-raised)]",
      )}
      onClick={handleRowClick}
    >
      <input
        type="checkbox"
        aria-label={labels.selectCampaign(row.name)}
        checked={selected}
        onChange={(e) => onToggleSelect?.(row.id, e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        disabled={!interactive || !isCampaign}
        className="row-span-2 size-4 accent-[var(--selection-text)]"
      />
      <span
        className="row-span-2 grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-control)] bg-[var(--neutral-bg)] text-xs font-bold text-[var(--neutral-text)]"
      >
        <WorkPreview key={row.previewHref ?? "missing"} row={row} labels={labels} />
      </span>
      <div className="min-w-0">
        {interactive ? (
          <Link href={row.href} className="block truncate font-medium text-[var(--text-primary)] hover:underline" onClick={(e) => e.stopPropagation()}>
            {row.name}
          </Link>
        ) : (
          <p className="truncate font-medium text-[var(--text-primary)]">{row.name}</p>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          <span className="font-mono uppercase tracking-wide">{row.originLabel}</span>
          {isCampaign ? (
            <>
              {" · "}
              {row.variations} {labels.variationsLabel} ·{" "}
              <span className="text-[var(--success-text)]">
                {row.approved} {labels.approvedLabel}
              </span>
            </>
          ) : null}
          {row.brandName ? <> · {row.brandName}</> : null}
          {row.protocol ? <> · {row.protocol}</> : null}
          {row.resultCount !== undefined ? <> · {row.resultCount} {labels.resultsLabel ?? "resultados"}</> : null}
          <> · {row.updated}</>
        </p>
      </div>
      <div className="col-start-3 flex min-w-0 flex-wrap items-center gap-2">
        <CampaignBadge variant={row.statusVariant} label={row.status} />
        {interactive ? (
          <Link
            href={row.href}
            aria-label={`${row.nextAction ?? labels.openCampaign}: ${row.name}`}
            className={cn(
              "ml-auto inline-flex min-h-8 items-center rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              row.statusVariant === "danger"
                ? "bg-[var(--danger-bg)] text-[var(--danger-text)]"
                : "bg-[var(--action-primary-bg)] text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)]",
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {row.nextAction ?? labels.openCampaign}
          </Link>
        ) : null}
      </div>
      {interactive ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            type="button"
            aria-label={labels.actionsFor(row.name)}
            className="row-span-2 grid h-8 w-8 place-items-center rounded-[var(--radius-control)] text-[var(--utility-icon)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            onClick={(e) => e.stopPropagation()}
          >
            ⋮
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <DropdownMenuItem onClick={() => router.push(row.href)}>{labels.openCampaign}</DropdownMenuItem>
            {isCampaign ? (
              <>
                <DropdownMenuItem onClick={() => onDuplicate?.(row.id)}>{labels.duplicate}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSaveAsTemplate?.(row.campaign)}>
                  {labels.saveAsTemplate}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onArchive?.(row.id)}>{labels.archive}</DropdownMenuItem>
                <DropdownMenuItem className="text-[var(--danger-text)]" onClick={() => onDelete?.(row.id)}>
                  {labels.delete}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          aria-label={labels.actionsFor(row.name)}
          className="row-span-2 grid h-8 w-8 place-items-center rounded-[var(--radius-control)] text-[var(--utility-icon)]"
        >
          ⋮
        </button>
      )}
    </li>
  );
}

function WorkPreview({ row, labels }: { row: CampaignV6Row; labels: CampaignsV6Labels }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  if (!row.previewHref || status === "failed") {
    const label = row.previewHref && status === "failed"
      ? labels.previewError ?? "Preview indisponível"
      : labels.previewUnavailable ?? "Sem preview";
    return (
      <span
        role="img"
        aria-label={`${label}: ${row.previewAlt ?? row.name}`}
        className="grid h-full w-full rounded-[var(--radius-control)] bg-[var(--neutral-bg)] place-items-center text-xs font-bold text-[var(--neutral-text)]"
      >
        {row.initials}
      </span>
    );
  }
  return (
    <span className="relative block h-full w-full overflow-hidden rounded-[var(--radius-control)]">
      {status === "loading" ? (
        <span
          role="status"
          aria-label={`${labels.previewLoading ?? "Carregando preview"}: ${row.previewAlt ?? row.name}`}
          className="absolute inset-0 animate-pulse bg-[var(--surface-inset)]"
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={row.previewHref}
        alt={row.previewAlt ?? row.name}
        className={cn(
          "h-full w-full rounded-[var(--radius-control)] object-cover",
          status === "loading" && "opacity-0",
        )}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("failed")}
      />
    </span>
  );
}

function FilterChip<T extends string>({
  label,
  count,
  interactive,
  options,
  value,
  onChange,
}: {
  label: string;
  count?: string;
  interactive: boolean;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange?: (value: T) => void;
}) {
  const chip = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
      {label}
      {count ? (
        <span className="rounded border border-[var(--border-subtle)] px-1.5 py-px font-mono text-[10px] text-[var(--text-muted)]">
          {count}
        </span>
      ) : null}
    </span>
  );

  if (!interactive || !onChange) {
    return (
      <button type="button" className="cursor-default">
        {chip}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger type="button">{chip}</DropdownMenuTrigger>
      <DropdownMenuContent className="border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
            className={value === option.value ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]" : undefined}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ViewToggle({
  pressed,
  label,
  onClick,
  className,
}: {
  pressed: boolean;
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={`rounded px-2 py-1.5 text-xs font-medium ${className ?? ""} ${
        pressed
          ? "bg-[var(--active-navigation-bg)] text-[var(--active-navigation-text)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {label}
    </button>
  );
}

function CampaignBadge({
  variant,
  label,
}: {
  variant: CampaignV6BadgeVariant;
  label: string;
}) {
  const styles = {
    success: "bg-[var(--success-bg)] text-[var(--success-text)]",
    warning: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    danger: "bg-[var(--danger-bg)] text-[var(--danger-text)]",
    info: "bg-[var(--info-bg)] text-[var(--info-text)]",
    neutral: "bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[variant]}`}>{label}</span>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-y divide-[var(--border-subtle)]">
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={index} className="px-4 py-3">
          <div className="h-10 animate-pulse rounded bg-[var(--surface-raised)]" />
        </li>
      ))}
    </ul>
  );
}

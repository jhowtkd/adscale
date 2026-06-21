import type { SortOption, StatusFilter, PlatformFilter } from "./types";

type TranslateFn = (key: string, values?: Record<string, unknown>) => string;

export function getStatusFilterLabel(
  value: StatusFilter,
  t: TranslateFn,
  tc: TranslateFn,
): string {
  if (value === "all") return tc("allStatus");
  return t(`status.${value}`);
}

export function getPlatformFilterLabel(
  value: PlatformFilter,
  t: TranslateFn,
  tc: TranslateFn,
): string {
  if (value === "all") return tc("allPlatforms");
  return t(`platformNames.${value}`);
}

export function getSortFilterLabel(value: SortOption, tc: TranslateFn): string {
  const labels: Record<SortOption, string> = {
    newest: tc("newest"),
    oldest: tc("oldest"),
    "name-asc": tc("nameAsc"),
    "name-desc": tc("nameDesc"),
    variations: tc("mostDerivations"),
  };
  return labels[value];
}

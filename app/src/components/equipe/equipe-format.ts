// Small presentational helpers for the Equipe client screens.

export function formatDateTime(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function validDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

// Compact weekday without locale dots ("seg." -> "seg"), so short dates
// read the same as the C5 design ("Seg 05", "seg 05/10").
function weekdayShort(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date).replace(/\./g, "");
}

// Card first line: "Seg 05". Weekday first like the design; the day/month
// order inside stays the client's locale order.
export function formatShortDay(iso: string | null | undefined, locale: string): string | null {
  const date = validDate(iso);
  if (!date) return null;
  const weekday = weekdayShort(date, locale);
  const head = weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
  return `${head} ${date.toLocaleDateString(locale, { day: "2-digit" })}`;
}

// Card deadline: "seg 05/10". Lowercase like the design ("decidir até …").
export function formatShortDate(iso: string | null | undefined, locale: string): string | null {
  const date = validDate(iso);
  if (!date) return null;
  return `${weekdayShort(date, locale)} ${date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}`;
}

export function captionTitle(caption: string | null | undefined, max = 80): string | null {
  const text = caption?.trim() ?? "";
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function shortHash(versionHash: string): string {
  return versionHash.length > 8 ? `${versionHash.slice(0, 8)}…` : versionHash;
}

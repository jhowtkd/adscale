const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface RelativeTimeLabels {
  now: string;
  minute: string;
  minutes: string;
  hour: string;
  hours: string;
  day: string;
  days: string;
}

const DEFAULT_LABELS: RelativeTimeLabels = {
  now: "now",
  minute: "1m",
  minutes: "{n}m",
  hour: "1h",
  hours: "{n}h",
  day: "1d",
  days: "{n}d",
};

function formatWith(label: string, n: number): string {
  return label.replace("{n}", String(n));
}

export function formatRelativeTime(
  date: Date,
  now: Date = new Date(),
  labels: Partial<RelativeTimeLabels> = {}
): string {
  const l = { ...DEFAULT_LABELS, ...labels };
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < MINUTE) return l.now;

  const minutes = Math.floor(diffMs / MINUTE);
  if (minutes < 60) {
    return minutes === 1 ? l.minute : formatWith(l.minutes, minutes);
  }

  const hours = Math.floor(diffMs / HOUR);
  if (hours < 24) {
    return hours === 1 ? l.hour : formatWith(l.hours, hours);
  }

  const days = Math.floor(diffMs / DAY);
  return days === 1 ? l.day : formatWith(l.days, days);
}

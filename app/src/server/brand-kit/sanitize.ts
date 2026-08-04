const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

/** Normalize a free-form color string to #RRGGBB, or null if not hex. */
export function normalizeHexColor(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (!value.startsWith("#")) value = `#${value}`;
  if (!HEX_RE.test(value)) return null;
  const hex = value.slice(1);
  if (hex.length === 3) {
    return `#${hex
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase()}`;
  }
  return `#${hex.toUpperCase()}`;
}

/** Drop non-hex / empty entries; cap at 50. AI extract often returns junk. */
export function sanitizeBrandColors(colors: unknown): string[] {
  if (!Array.isArray(colors)) return [];
  const out: string[] = [];
  for (const entry of colors) {
    if (typeof entry !== "string") continue;
    const normalized = normalizeHexColor(entry);
    if (normalized && !out.includes(normalized)) out.push(normalized);
    if (out.length >= 50) break;
  }
  return out;
}

/** Drop empty font names; cap at 50. */
export function sanitizeBrandFonts(fonts: unknown): string[] {
  if (!Array.isArray(fonts)) return [];
  const out: string[] = [];
  for (const entry of fonts) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed.slice(0, 120));
    if (out.length >= 50) break;
  }
  return out;
}

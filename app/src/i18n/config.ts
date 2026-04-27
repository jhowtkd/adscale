export const locales = ["pt-BR", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "pt-BR";

export function isValidLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

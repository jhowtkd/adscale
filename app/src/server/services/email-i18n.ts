import { getTranslations } from "next-intl/server";
import { defaultLocale, isValidLocale, type Locale } from "@/i18n/config";

export function resolveEmailLocale(locale?: string | null): Locale {
  if (locale && isValidLocale(locale)) {
    return locale;
  }
  return defaultLocale;
}

export async function getTransactionalEmailTranslations(locale?: string | null) {
  const resolved = resolveEmailLocale(locale);
  const t = await getTranslations({ locale: resolved, namespace: "transactionalEmails" });
  return { t, locale: resolved };
}

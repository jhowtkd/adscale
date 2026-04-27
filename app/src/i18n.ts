import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { isValidLocale, defaultLocale } from "@/i18n/config";

export default getRequestConfig(async () => {
  // 1. Check cookie first
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;

  // 2. Check Accept-Language header
  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language");
  const browserLocale = acceptLanguage?.split(",")[0]?.split("-")[0];
  const detectedLocale = browserLocale === "pt" ? "pt-BR" : "en";

  // 3. Resolve locale priority: cookie > browser > default
  const locale: string = isValidLocale(cookieLocale ?? "")
    ? cookieLocale!
    : isValidLocale(detectedLocale)
      ? detectedLocale
      : defaultLocale;

  const messages = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: "America/Sao_Paulo",
    now: new Date(),
  };
});

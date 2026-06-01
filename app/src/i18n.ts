import { getRequestConfig } from "next-intl/server";
import { IntlErrorCode } from "next-intl";
import { cookies, headers } from "next/headers";
import { isValidLocale, defaultLocale } from "@/i18n/config";

const messageLoaders = {
  en: () => import("../messages/en.json"),
  "pt-BR": () => import("../messages/pt-BR.json"),
};

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

  const messages = (await messageLoaders[locale as keyof typeof messageLoaders]()).default;

  return {
    locale,
    messages,
    timeZone: "America/Sao_Paulo",
    now: new Date(),
    onError(error) {
      // A missing key shouldn't crash the render or flood the logs; surface it
      // as a concise warning in dev and let the fallback below render the path.
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[i18n] ${error.message}`);
        }
        return;
      }
      console.error(error);
    },
    getMessageFallback({ key, namespace }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});

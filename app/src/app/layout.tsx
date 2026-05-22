import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import QueryProvider from "@/components/providers/QueryProvider";
import A11yProvider from "@/components/providers/A11yProvider";
import CookieBanner from "@/components/cookie-consent/CookieBanner";
import { SentryErrorBoundary } from "@/components/providers/SentryErrorBoundary";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getMessages();
  const meta = messages.metadata as Record<string, string>;
  return {
    title: meta?.title ?? "ADScale",
    description: meta?.description ?? "",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="antialiased">
      <body className="min-h-screen bg-background text-foreground font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--surface-base)] focus:text-[var(--text-primary)] focus:rounded-md focus:shadow-lg focus:ring-2 focus:ring-[var(--accent-mint)]"
        >
          Pular para conteúdo principal
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <QueryProvider>
            <A11yProvider>
              <TooltipProvider>
                <SentryErrorBoundary>
                  <main id="main" className="contents">
                    {children}
                  </main>
                  <Toaster
                    position="bottom-right"
                    toastOptions={{
                      style: {
                        background: "var(--surface-base)",
                        border: "1px solid var(--border-dim)",
                        color: "var(--text-primary)",
                      },
                    }}
                  />
                </SentryErrorBoundary>
              </TooltipProvider>
            </A11yProvider>
          </QueryProvider>
        </NextIntlClientProvider>
        <CookieBanner />
      </body>
    </html>
  );
}

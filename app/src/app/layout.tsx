import type { Metadata, Viewport } from "next";
import { Inter, Press_Start_2P, Space_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import QueryProvider from "@/components/providers/QueryProvider";
import A11yProvider from "@/components/providers/A11yProvider";
import CookieBanner from "@/components/cookie-consent/CookieBanner";
import { SentryErrorBoundary } from "@/components/providers/SentryErrorBoundary";
import ToastStack from "@/components/providers/ToastStack";
import ThemeProvider from "@/components/providers/ThemeProvider";
import MotionProvider from "@/components/providers/MotionProvider";
import { Agentation } from "agentation";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const messages = await getMessages();
  const meta = messages.metadata as Record<string, string>;
  return {
    title: meta?.title ?? "ADScale",
    description: meta?.description ?? "",
    other: {
      "dns-prefetch": "//r2.adscale.com",
    },
  };
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});

const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);

  return (
    <html lang={locale} className={`${inter.variable} ${spaceMono.variable} ${pressStart.variable} light antialiased`} suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://r2.adscale.com" />
        <link rel="dns-prefetch" href="https://r2.adscale.com" />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--surface-base)] focus:text-[var(--text-primary)] focus:rounded-md focus:shadow-lg focus:ring-2 focus:ring-[var(--accent-green)]"
        >
          Pular para conteúdo principal
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <QueryProvider>
            <A11yProvider>
              <TooltipProvider>
                <SentryErrorBoundary>
                  <MotionProvider>
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
                    <ToastStack />
                  </MotionProvider>
                </SentryErrorBoundary>
              </TooltipProvider>
            </A11yProvider>
          </QueryProvider>
        </NextIntlClientProvider>
        <CookieBanner />
        </ThemeProvider>
        {process.env.NODE_ENV === "development" && (
          <Agentation endpoint="http://localhost:4747" />
        )}
      </body>
    </html>
  );
}

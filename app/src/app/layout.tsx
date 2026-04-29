import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import QueryProvider from "@/components/providers/QueryProvider";
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
        <NextIntlClientProvider messages={messages} locale={locale}>
          <QueryProvider>
            <TooltipProvider>
              {children}
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
            </TooltipProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

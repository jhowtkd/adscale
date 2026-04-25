import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import QueryProvider from "@/components/providers/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADScale — AI-Powered Ad Creative Derivation",
  description:
    "Transform a single base creative into dozens of A/B test-ready variations for Meta Ads, TikTok, and Google Ads.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-screen bg-[var(--deep-bg)] text-[var(--text-primary)] font-sans">
        <QueryProvider>
          <TooltipProvider>
            {children}
            <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--surface-raised)",
                border: "1px solid var(--border-dim)",
                color: "var(--text-primary)",
              },
            }}
          />
        </TooltipProvider>
      </QueryProvider>
      </body>
    </html>
  );
}

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

function getR2Hostname(): string | undefined {
  try {
    const url = process.env.R2_PUBLIC_BASE_URL;
    if (url) {
      return new URL(url).hostname;
    }
  } catch {
    // ignore invalid URL
  }
  return undefined;
}

const r2Hostname = getR2Hostname();

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [
      ...(r2Hostname ? [{ protocol: "https" as const, hostname: r2Hostname }] : []),
      { protocol: "https" as const, hostname: "*.r2.dev" },
      { protocol: "https" as const, hostname: "*.r2.cloudflarestorage.com" },
    ],
  },
};

const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.SENTRY_DSN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
  disableLogger: true,
};

export default withSentryConfig(withNextIntl(nextConfig), sentryOptions);

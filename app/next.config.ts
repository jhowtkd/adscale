import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

export default withNextIntl(nextConfig);

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

function withOptionalBundleAnalyzer(config: NextConfig): NextConfig {
  if (process.env.ANALYZE !== "true") {
    return config;
  }
  // Lazy require so production builds on Render do not need the analyzer package.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: true });
  return withBundleAnalyzer(config);
}

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

const marketingUpstream =
  process.env.MARKETING_UPSTREAM_URL?.replace(/\/$/, "") ??
  "https://adscale-marketing.onrender.com";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  // Brand-kit multi-upload allows up to 12 × 10MB images. Next.js buffers
  // route-handler bodies at 10MB by default, which truncates the multipart
  // payload and makes `request.formData()` throw. Match the route's own cap.
  experimental: {
    proxyClientMaxBodySize: "120mb",
  },
  // `INNGEST_DEV` points at the local Inngest dev server and disables
  // signature verification. It must never be present in a production
  // build (the Inngest client throws if it is). Next loads `.env.local`
  // for all commands, so we strip the var here whenever NODE_ENV is
  // production to make `next build` reproducible and to ensure the
  // bundled runtime never sees it on Render either.
  env: {
    INNGEST_DEV:
      process.env.NODE_ENV === "production" ? "" : process.env.INNGEST_DEV,
  },
  async rewrites() {
    return [
      { source: "/manual", destination: "/manual/index.html" },
      { source: "/manual/", destination: "/manual/index.html" },
      { source: "/hi", destination: `${marketingUpstream}/` },
      { source: "/hi/", destination: `${marketingUpstream}/` },
      { source: "/hi/assets/:path*", destination: `${marketingUpstream}/assets/:path*` },
      { source: "/hi/Adscale.svg", destination: `${marketingUpstream}/Adscale.svg` },
      { source: "/Adscale.svg", destination: `${marketingUpstream}/Adscale.svg` },
    ];
  },
  images: {
    remotePatterns: [
      ...(r2Hostname ? [{ protocol: "https" as const, hostname: r2Hostname }] : []),
      { protocol: "https" as const, hostname: "*.r2.dev" },
      { protocol: "https" as const, hostname: "*.r2.cloudflarestorage.com" },
    ],
  },
  compiler: {
    // Keep structured logger output in production (derivation jobs, QA, memory).
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn", "info"] }
        : false,
  },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const scriptSrc = isProd
      ? "'self' 'unsafe-inline'"
      : "'self' 'unsafe-inline' 'unsafe-eval'";
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' blob: data: https:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.sentry.io https://api.stripe.com https://fonts.googleapis.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
        ],
      },
    ];
  },
  async redirects() {
    // Compatibility only. Keep /monitoring untouched: Sentry owns that
    // transport route below.
    return [
      { source: "/jobs", destination: "/campaigns", permanent: false },
      { source: "/quick-tools", destination: "/", permanent: false },
      { source: "/restyling", destination: "/?intent=restyle", permanent: false },
      { source: "/quick-tools/restyling", destination: "/?intent=restyle", permanent: false },
    ];
  },
};

const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.SENTRY_DSN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  hideSourceMaps: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

export default withSentryConfig(
  withOptionalBundleAnalyzer(withNextIntl(nextConfig)),
  sentryOptions,
);

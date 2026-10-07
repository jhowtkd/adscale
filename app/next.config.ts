import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";
import { publicStudioRewrites, readPublicStudioFlags } from "./src/lib/public-studio-config";

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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Preserve original query encoding/interleaving for legacy composer translation and the login callback.
  // Next otherwise groups parsed.query before proxy receives its NextRequest.
  skipProxyUrlNormalize: true,
  // Playwright and some local clients hit 127.0.0.1 while `next dev` serves
  // localhost. Without this, Next 16 blocks /_next resources and the Studio
  // shell never hydrates — Começar is inert HTML.
  allowedDevOrigins: ["127.0.0.1"],
  output: 'standalone',
  // Render builds run under an 8 GiB limit and died there after #588
  // (OOM right after "Running TypeScript"). Types are already enforced by
  // the CI `typecheck` job on every PR, so the Render build skips the
  // duplicate check; CI builds (RENDER unset) keep it.
  typescript: { ignoreBuildErrors: process.env.RENDER === "true" },
  outputFileTracingRoot: process.cwd(),
  // Brand-kit multi-upload allows up to 12 × 10MB images. Next.js buffers
  // route-handler bodies at 10MB by default, which truncates the multipart
  // payload and makes `request.formData()` throw. Match the route's own cap.
  experimental: {
    // Keep the build under Render's 8 GiB: every page-data / static worker
    // inherits the 4 GiB heap and loads the whole server module graph, so
    // cap the worker count and let webpack trim its own memory.
    cpus: 2,
    webpackMemoryOptimizations: true,
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
    readPublicStudioFlags(process.env);
    const studio = publicStudioRewrites();
    return {
      beforeFiles: studio.beforeFiles,
      afterFiles: [
        { source: "/manual", destination: "/manual/index.html" },
        { source: "/manual/", destination: "/manual/index.html" },
        ...studio.afterFiles,
      ],
      fallback: studio.fallback,
    };
  },
  images: {
    // Keep untrusted image decoding out of the public Next.js server endpoint.
    // All current Image consumers already serve their original URLs directly.
    unoptimized: true,
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
    // Baked at `next build`. CI sets E2E_STORAGE_DIR so axe can inject after
    // remaining e2e-storage:// <img> URLs (dashboard thumbnails). Never set
    // that env on Render.
    const e2eStorageImages = process.env.E2E_STORAGE_DIR ? " e2e-storage:" : "";
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
              `img-src 'self' blob: data: https:${e2eStorageImages}`,
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.sentry.io https://api.stripe.com https://fonts.googleapis.com http://localhost:4747",
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
      { source: "/quick-tools", destination: "/creative-work/new", permanent: false },
      { source: "/restyling", destination: "/creative-work/new?intent=restyle", permanent: false },
      { source: "/quick-tools/restyling", destination: "/creative-work/new?intent=restyle", permanent: false },
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

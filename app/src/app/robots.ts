import type { MetadataRoute } from "next";

function getSiteOrigin(): string {
  const raw = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://adscale.jhonatansoares.com";
  return raw.replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const siteOrigin = getSiteOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: ["/hi", "/privacy", "/terms"],
      disallow: [
        "/api/",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/campaigns",
        "/settings",
        "/assistant",
        "/library",
        "/templates",
        "/restyling",
        "/feedback",
        "/docs",
        "/quick-tools",
        "/v6",
        "/share",
        "/admin",
        "/invite",
        "/monitoring",
      ],
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}

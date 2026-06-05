import { defineConfig } from "drizzle-kit";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (process.env.NODE_ENV === "production" && !url.includes("sslmode=")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}uselibpqcompat=true&sslmode=require`;
  }
  return url;
}

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["adscale_app"],
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  // Aplicar migrações em schemas não padrão
  migrations: {
    schema: "public",
  },
});

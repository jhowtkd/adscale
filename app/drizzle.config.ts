import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["adscale_app"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Aplicar migrações em schemas não padrão
  migrations: {
    schema: "public",
  },
});

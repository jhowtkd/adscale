import { Pool } from "pg";
import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "../validation/env";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  // Neon serverless compute can cold-start; 2s was too aggressive and caused
  // intermittent "Connection terminated due to connection timeout" errors.
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});
export const db = drizzle(pool, { schema });

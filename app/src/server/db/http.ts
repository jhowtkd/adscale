import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { env } from "../validation/env";

/**
 * HTTP-backed Drizzle client for serverless route handlers.
 *
 * Use this in Next.js route handlers and server components instead of the
 * long-running `pg`-pool-backed `db` (which causes connection exhaustion
 * under serverless fan-out). Continue using `db` for Inngest jobs, scripts,
 * and any code path with sustained connection reuse.
 */
const sql = neon(env.DATABASE_URL);
export const dbHttp = drizzle(sql, { schema });
export type DbHttp = typeof dbHttp;

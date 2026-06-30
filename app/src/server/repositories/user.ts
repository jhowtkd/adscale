import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import { defaultLocale } from "@/i18n/config";

export async function getUserLocale(userId: string): Promise<string> {
  const result = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return result[0]?.locale ?? defaultLocale;
}

export async function getLocaleByEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const result = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(sql`lower(${user.email})`, normalized))
    .limit(1);
  return result[0]?.locale ?? defaultLocale;
}

export async function getUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
    })
    .from(user)
    .where(eq(sql`lower(${user.email})`, normalized))
    .limit(1);

  return rows[0] ?? null;
}

import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";

export async function getUserLocale(userId: string): Promise<string> {
  const result = await db
    .select({ locale: user.locale })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return result[0]?.locale ?? "pt-BR";
}

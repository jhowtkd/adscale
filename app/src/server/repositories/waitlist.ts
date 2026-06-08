import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { waitlistSignups, type WaitlistSignup } from "@/server/db/schema";

export async function findWaitlistSignupByEmail(email: string): Promise<WaitlistSignup | null> {
  const [row] = await db
    .select()
    .from(waitlistSignups)
    .where(eq(waitlistSignups.email, email))
    .limit(1);
  return row ?? null;
}

export async function createWaitlistSignup(input: {
  name: string;
  email: string;
  sector: string;
  sectorOther: string | null;
  whatsapp: string;
  consentAt: Date;
  consentVersion: string;
  locale: string;
  resendContactId?: string | null;
}): Promise<WaitlistSignup> {
  const [row] = await db
    .insert(waitlistSignups)
    .values({
      name: input.name,
      email: input.email,
      sector: input.sector,
      sectorOther: input.sectorOther,
      whatsapp: input.whatsapp,
      consentAt: input.consentAt,
      consentVersion: input.consentVersion,
      locale: input.locale,
      resendContactId: input.resendContactId ?? null,
    })
    .returning();
  return row;
}

export async function updateWaitlistResendContactId(id: string, resendContactId: string) {
  await db
    .update(waitlistSignups)
    .set({ resendContactId })
    .where(eq(waitlistSignups.id, id));
}

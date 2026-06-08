import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { rateLimit } from "@/lib/rate-limit";
import { corsMarketingHeaders, jsonWithCors } from "@/lib/cors-marketing";
import { waitlistSignupSchema, WAITLIST_CONSENT_VERSION } from "@/server/waitlist/schema";
import { normalizeEmail, normalizeWhatsapp, isValidWhatsappLength } from "@/server/waitlist/normalize";
import {
  createWaitlistSignup,
  findWaitlistSignupByEmail,
  updateWaitlistResendContactId,
} from "@/server/repositories/waitlist";
import { syncWaitlistContact } from "@/server/services/resend-contacts";
import { sendWaitlistConfirmationEmail } from "@/server/services/email";
import { logger } from "@/lib/logger";

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsMarketingHeaders(request) });
}

export async function POST(request: Request) {
  const cors = corsMarketingHeaders(request);

  try {
    const limited = await rateLimit(request, "auth");
    if (!limited.success) {
      return jsonWithCors(request, { error: "rateLimitExceeded" }, 429);
    }

    const body = await request.json();
    const parsed = waitlistSignupSchema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(request, { error: "invalidInput", details: parsed.error.flatten() }, 400);
    }

    // Honeypot — silent success
    if (parsed.data.website?.trim()) {
      return jsonWithCors(request, { status: "created" }, 201);
    }

    const email = normalizeEmail(parsed.data.email);
    const whatsapp = normalizeWhatsapp(parsed.data.whatsapp);
    if (!isValidWhatsappLength(whatsapp)) {
      return jsonWithCors(request, { error: "invalidInput", code: "invalidWhatsapp" }, 400);
    }

    const existing = await findWaitlistSignupByEmail(email);
    if (existing) {
      const t = await getTranslations({ locale: parsed.data.locale, namespace: "waitlist" });
      return jsonWithCors(
        request,
        { status: "already_registered", message: t("duplicateEmail") },
        409
      );
    }

    const signup = await createWaitlistSignup({
      name: parsed.data.name.trim(),
      email,
      sector: parsed.data.sector,
      sectorOther: parsed.data.sector === "other" ? parsed.data.sectorOther?.trim() ?? null : null,
      whatsapp,
      consentAt: new Date(),
      consentVersion: WAITLIST_CONSENT_VERSION,
      locale: parsed.data.locale,
    });

    try {
      const contactId = await syncWaitlistContact({
        email,
        name: signup.name,
        sector: signup.sector,
        whatsapp,
      });
      if (contactId) await updateWaitlistResendContactId(signup.id, contactId);
    } catch (err) {
      logger.error("[waitlist] Resend sync failed", { id: signup.id, err });
    }

    try {
      await sendWaitlistConfirmationEmail({ to: email, locale: parsed.data.locale });
    } catch (err) {
      logger.error("[waitlist] Confirmation email failed", { id: signup.id, err });
    }

    return jsonWithCors(request, { status: "created" }, 201);
  } catch (err) {
    logger.error("[waitlist] POST failed", { err });
    return NextResponse.json({ error: "generic" }, { status: 500, headers: cors });
  }
}

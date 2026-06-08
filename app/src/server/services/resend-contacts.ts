import { env } from "@/server/validation/env";
import { logger } from "@/lib/logger";

type SyncInput = {
  email: string;
  name: string;
  sector: string;
  whatsapp: string;
};

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

async function resendFetch(path: string, init: RequestInit) {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

export async function syncWaitlistContact(input: SyncInput): Promise<string | null> {
  const segmentId = process.env.RESEND_WAITLIST_SEGMENT_ID?.trim();
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.startsWith("re_test") || !segmentId) {
    logger.warn("[resend-contacts] Skipping sync — missing API key or segment id");
    return null;
  }

  const { firstName, lastName } = splitName(input.name);
  const payload = {
    email: input.email,
    first_name: firstName,
    last_name: lastName,
    unsubscribed: false,
    properties: {
      sector: input.sector,
      whatsapp: input.whatsapp,
      source: "marketing-site",
    },
    segments: [{ id: segmentId }],
  };

  const { response, body } = await resendFetch("/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return (body as { id?: string }).id ?? null;
  }

  // Contact may already exist — try update
  if (response.status === 409 || response.status === 422) {
    const { response: patchRes, body: patchBody } = await resendFetch(
      `/contacts/${encodeURIComponent(input.email)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          properties: payload.properties,
        }),
      }
    );
    if (patchRes.ok) {
      return (patchBody as { id?: string }).id ?? null;
    }
  }

  logger.error("[resend-contacts] Failed to sync contact", {
    status: response.status,
    email: input.email,
  });
  return null;
}

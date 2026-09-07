export const CREATIVE_ANNOUNCEMENT_EVENT = "adscale:creative-announcement";
export const CREATIVE_ANNOUNCEMENT_STORAGE_KEY = "adscale_creative_announcement";

export function announcementDetailFromEvent(event: Event): string | null {
  return event instanceof CustomEvent && typeof event.detail === "string" ? event.detail : null;
}

export function readStoredCreativeAnnouncement(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredCreativeAnnouncement(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY);
  } catch {
    /* Storage is optional. */
  }
}

export function broadcastCreativeAnnouncement(message: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CREATIVE_ANNOUNCEMENT_STORAGE_KEY, message);
  } catch {
    /* Storage is optional; the event remains the primary delivery path. */
  }
  window.dispatchEvent(new CustomEvent(CREATIVE_ANNOUNCEMENT_EVENT, { detail: message }));
}

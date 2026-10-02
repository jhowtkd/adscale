// The mesa: the fan of five equal cards on top of the main conversation (v4, H1–H5).
//   before the handoff   → the first five curated inspirations: the picture and the "Inspiração" stamp (never the catalog's name for it, which is a file name)
//   during the handoff   → the brand, built from the handoff state: site photo, logo, palette and Instagram posts;
//                          a group still being read shows as a "na fila" card
//   after the handoff    → the same cards from the Library
// Pure builders: what each phase shows is decided here, with no React and no fetching.

import type { HandoffGroup, HandoffItem, HandoffState } from "@/server/equipe/domain/handoff";

export type MesaPhoto = { id: string; src: string; origin: "site" | "instagram" | "user" };

export type MesaCard =
  | { kind: "inspiration"; id: string; src: string }
  | { kind: "photo"; id: string; src: string; origin: "site" | "instagram" | "user" }
  | { kind: "logo"; id: string; src: string }
  | { kind: "palette"; id: string; colors: string[] }
  | { kind: "queued"; id: string; group: HandoffGroup };

export const MESA_SLOTS = 5;

/** The photos the fan can show (three slots): the site first, then the Instagram, then what the person sent. */
export function orderPhotos(photos: ReadonlyArray<MesaPhoto>): MesaPhoto[] {
  const unique = [...new Map(photos.map((item) => [item.id, item])).values()];
  const site = unique.filter((item) => item.origin === "site");
  const instagram = unique.filter((item) => item.origin === "instagram");
  const own = unique.filter((item) => item.origin === "user");
  return [site[0], instagram[0], instagram[1] ?? site[1], own[0], site[2], instagram[2]]
    .filter((item): item is MesaPhoto => Boolean(item))
    .slice(0, 3);
}

/** Where a managed image is served from: our own copy, never the address it was read from. */
export const mesaImageSource = (item: Pick<HandoffItem, "id" | "key">) =>
  item.key && /^[0-9a-f-]{36}$/i.test(item.id) ? `/api/workspace/assets/${item.id}/file` : null;

const pending = (status: string | undefined) => status === "pending" || status === "running";

/** The Instagram profile counts only once the person confirmed it, or when it is the source of the reading. */
export function hasConfirmedInstagram(h: Pick<HandoffState, "source" | "decisions">): boolean {
  return h.source?.kind === "instagram" || Boolean(h.decisions.networks?.some((item) => item.platform === "instagram"));
}

/** First open: nothing was read or decided yet, so the mesa still shows inspirations. */
export function isFirstOpen(h: Pick<HandoffState, "step" | "captured" | "decisions"> | null | undefined): boolean {
  if (!h) return true;
  if (h.step !== "source") return false;
  const captured = Object.values(h.captured).some((items) => (items?.length ?? 0) > 0);
  return !captured && !h.decisions.identity && !h.decisions.networks && !h.decisions.images;
}

export type MesaPhase = "inspirations" | "handoff" | "library";

export function mesaPhase(h: Pick<HandoffState, "step" | "captured" | "decisions"> | null | undefined): MesaPhase {
  if (h?.step === "done") return "library";
  return isFirstOpen(h) ? "inspirations" : "handoff";
}

/** The title of an inspiration is not read here on purpose: the card is the picture and the stamp. */
export function inspirationCards(inspirations: ReadonlyArray<{ id: string; previewUrl: string | null }>): MesaCard[] {
  return inspirations
    .filter((item): item is typeof item & { previewUrl: string } => Boolean(item.previewUrl))
    .slice(0, MESA_SLOTS)
    .map((item) => ({ kind: "inspiration" as const, id: item.id, src: item.previewUrl }));
}

/** Left-to-right order of the fan: photo, logo, photo, palette, photo. Cards that have nothing to show are left out. */
export function arrangeFan(parts: {
  photos: MesaCard[];
  logo?: MesaCard | null;
  palette?: MesaCard | null;
}): MesaCard[] {
  const [first, second, third] = parts.photos;
  return [first, parts.logo ?? undefined, second, parts.palette ?? undefined, third].filter((card): card is MesaCard => Boolean(card));
}

/** The brand as the handoff has read and decided it so far. */
export function handoffCards(h: HandoffState): MesaCard[] {
  const confirmedInstagram = hasConfirmedInstagram(h);
  const removed = new Set(h.decisions.images?.removed ?? []);
  // Only our managed copies, never what the person removed, and no Instagram post before the profile is confirmed.
  const images = [...(h.captured.images ?? []), ...(h.decisions.images?.uploaded ?? []), ...(h.decisions.uploadedImages ?? [])]
    .filter((item) => !removed.has(item.id) && (item.origin !== "instagram" || confirmedInstagram))
    .flatMap((item): MesaPhoto[] => {
      const src = mesaImageSource(item);
      return src ? [{ id: item.id, src, origin: item.origin }] : [];
    });
  const photos: MesaCard[] = orderPhotos(images).map((item) => ({ kind: "photo", ...item }));
  // Images still being read: the missing photo slots wait as "na fila" cards.
  if (pending(h.reading.images?.status)) {
    for (let index = photos.length; index < 3; index += 1) photos.push({ kind: "queued", id: `queued-images-${index}`, group: "images" });
  }

  const logoItem = h.decisions.identity
    ? h.decisions.identity.logo
    : h.decisions.uploadedLogo ?? (h.captured.logo ?? []).find((item) => item.key) ?? null;
  const logoSrc = logoItem ? mesaImageSource(logoItem) : null;
  const logo: MesaCard | null = logoSrc && logoItem ? { kind: "logo", id: logoItem.id, src: logoSrc }
    : pending(h.reading.logo?.status) ? { kind: "queued", id: "queued-logo", group: "logo" } : null;

  const paletteOrigin = h.decisions.identity?.paletteChoice ?? h.source?.kind ?? "site";
  const colors = h.decisions.identity
    ? h.decisions.identity.colors.map((item) => item.value)
    : (h.captured.colors ?? []).filter((item) => item.origin === paletteOrigin).map((item) => item.value);
  const palette: MesaCard | null = colors.length > 0 ? { kind: "palette", id: "palette", colors: colors.slice(0, 6) }
    : pending(h.reading.colors?.status) ? { kind: "queued", id: "queued-colors", group: "colors" } : null;

  return arrangeFan({ photos, logo, palette });
}

/** The brand as the Library holds it once the handoff is done. */
export function libraryCards(input: {
  logo: { id: string; src: string } | null;
  colors: string[];
  photos: MesaPhoto[];
}): MesaCard[] {
  return arrangeFan({
    photos: orderPhotos(input.photos).map((item): MesaCard => ({ kind: "photo", ...item })),
    logo: input.logo ? { kind: "logo", ...input.logo } : null,
    palette: input.colors.length > 0 ? { kind: "palette", id: "palette", colors: input.colors.slice(0, 6) } : null,
  });
}

type ThreadMessageLike = { type: string; payload: Record<string, unknown> };

/**
 * Large while the conversation is just opening, as in H1: nothing but the Strategist's opening line and the first card.
 * From the next thing that happens (an answer, a decision, a reading) it is compact, as in H2.
 */
export function mesaSizeFor(messages: ReadonlyArray<ThreadMessageLike>): "large" | "compact" {
  const opening = messages.every(
    (message) =>
      (message.type === "assistant" && message.payload.handoffStep === "intro") ||
      (message.type === "equipe_card" && message.payload.kind === "handoff" && message.payload.step === "source"),
  );
  return opening ? "large" : "compact";
}

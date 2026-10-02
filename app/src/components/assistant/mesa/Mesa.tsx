"use client";

// The mesa (v4): a fan of up to five equal cards, rotated up to 8° with a soft shadow, at the top of the main
// conversation. Large while the conversation is just opening (H1), compact after (H2). The bottom dissolves into the
// canvas by a percentage mask, so the fade follows the real height of the fan and no text ever sits over an image.
// While the brand is still being read it is `pinned`: it stays at the top of the conversation's scroll, so the cards that
// wait in the queue and the brand being assembled are always in view; after "É isso" it scrolls with the conversation.

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks/use-media-query";
import type { MesaCard } from "@/lib/equipe/mesa";
import { logoPlateBackground } from "@/server/equipe/domain/logo-surface";

/** Slots of the fan, in percent of the fan's own box (design box 920 × 350, cards 200 × 250). */
const FAN = [
  { left: 2.2, top: 16.6, rotate: -8 },
  { left: 21.3, top: 8, rotate: -3 },
  { left: 40.4, top: 3.4, rotate: 0 },
  { left: 59.2, top: 9.1, rotate: 4 },
  { left: 77.7, top: 20, rotate: 8 },
] as const;

/** Which slots a fan with fewer than five cards uses, so a short fan stays centered. */
const SLOTS: Record<number, readonly number[]> = { 1: [2], 2: [1, 3], 3: [1, 2, 3], 5: [0, 1, 2, 3, 4] };

/**
 * Four cards have no slots of the five that stay centered (skipping the middle one left a hole there): they get their own, with the same step between cards
 * (19.1% of the fan), centered (10.5% on each side) and a symmetric arch (ticket 13, T3 of the screen review).
 */
const FOUR_FAN = [
  { left: 10.5, top: 14, rotate: -6 },
  { left: 29.6, top: 5.5, rotate: -2 },
  { left: 48.7, top: 5.5, rotate: 2 },
  { left: 67.8, top: 14, rotate: 6 },
] as const;

/** On a phone five cards would be thumbnails: the three central ones, larger (box 100 × 54). */
const PHONE_FAN = [
  { left: 3, top: 14, rotate: -6 },
  { left: 33.5, top: 4, rotate: 0 },
  { left: 64, top: 14, rotate: 6 },
] as const;

const CARD_WIDTH = 21.7;
const PHONE_CARD_WIDTH = 33;
const stamp =
  "absolute left-[6%] top-[5%] z-10 rounded-full bg-black/55 px-[0.9em] py-[0.45em] font-mono uppercase tracking-[0.14em] text-white/95";

export default function Mesa({ cards, size, pinned = false }: { cards: MesaCard[]; size: "large" | "compact"; pinned?: boolean }) {
  const t = useTranslations("assistant.mesa");
  const phone = useIsMobile();
  const all = cards.slice(0, 5);
  if (all.length === 0) return null;
  const fan = phone ? (all.length >= 5 ? all.slice(1, 4) : all.slice(0, 3)) : all;
  const slots = SLOTS[fan.length];
  // A phone is always compact; the large fan belongs to a wide screen.
  const large = size === "large" && !phone;
  const cardWidth = phone ? PHONE_CARD_WIDTH : CARD_WIDTH;

  const originLabel = { site: t("fromSite"), instagram: t("fromInstagram"), user: t("fromYou") } as const;

  const mesa = (
    <div
      data-testid="mesa"
      data-size={size}
      data-cards={fan.length}
      data-pinned={pinned ? "true" : "false"}
      className={cn("pointer-events-none mx-auto w-full select-none px-4", large ? "max-w-[920px] md:px-0" : "max-w-[712px]")}
    >
      <div
        className="relative w-full"
        style={{
          containerType: "inline-size",
          aspectRatio: phone ? "100 / 54" : "920 / 350",
          // Pinned, it leaves the screen to the card being answered: smaller on a phone, and on a short window no more
          // than 28% of its height.
          maxHeight: large ? undefined : phone ? (pinned ? "132px" : "158px") : pinned ? "min(205px, 28vh)" : "205px",
          // Rotated cards may reach past the sides; only the bottom is cut.
          clipPath: "inset(-20% -15% 0 -15%)",
        }}
      >
        <ul role="list" aria-label={t("label")} className="m-0 list-none p-0">
          {fan.map((card, index) => {
            const slot = phone ? PHONE_FAN[index]! : fan.length === 4 ? FOUR_FAN[index]! : FAN[slots![index]!]!;
            return (
              <li
                key={card.id}
                data-testid={`mesa-card-${card.kind}`}
                className="absolute"
                style={{
                  left: `${slot.left}%`,
                  top: `${slot.top}%`,
                  width: `${cardWidth}%`,
                  transform: `rotate(${slot.rotate}deg)`,
                  zIndex: index + 1,
                }}
              >
                <div
                  className="relative aspect-[4/5] w-full overflow-hidden shadow-[0_18px_36px_-10px_rgba(0,0,0,0.6)]"
                  style={{ borderRadius: "11% / 8.8%", fontSize: phone ? "max(8px, 2.3cqw)" : "max(7px, 1.05cqw)" }}
                >
                  {card.kind === "inspiration" ? (
                    <>
                      {/* Only the picture and the stamp: the catalog's own name for the piece is never shown (it is a file name). The text for assistive technology is generic. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.src} alt={t("inspirationAlt")} className="absolute inset-0 size-full object-cover" />
                      <span className={stamp}>{t("inspiration")}</span>
                    </>
                  ) : null}
                  {card.kind === "photo" ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.src} alt="" className="absolute inset-0 size-full object-cover" />
                      <span className={stamp}>{originLabel[card.origin]}</span>
                    </>
                  ) : null}
                  {card.kind === "logo" ? (
                    // The plate the logo was measured to ask for (a logo with light ink, like a white wordmark, would vanish on the cream one): the cream plate without a measure.
                    <div data-surface={card.surface ?? "light"} className="absolute inset-0 grid place-items-center p-[12%]" style={{ background: logoPlateBackground(card.surface ?? "light") }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.src} alt={t("logo")} className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : null}
                  {card.kind === "palette" ? (
                    <div className="absolute inset-0 flex flex-col gap-[3.5%] bg-[linear-gradient(170deg,#17191d,#101115)] p-[8%]">
                      {card.colors.map((color, position) => (
                        <span
                          key={`${color}-${position}`}
                          data-testid="mesa-swatch"
                          className="block min-h-0 flex-1 rounded-[22%/38%] border border-white/5"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      {/* Like the titles of the inspirations: the compact fan dissolves where this caption sits. */}
                      <span
                        className={large ? "mt-[2%] font-mono uppercase tracking-[0.14em] text-white/45" : "sr-only"}
                        style={large ? { fontSize: "max(6px, 0.9cqw)" } : undefined}
                      >
                        {t("palette", { count: card.colors.length })}
                      </span>
                    </div>
                  ) : null}
                  {card.kind === "queued" ? (
                    <div className="absolute inset-0 bg-[linear-gradient(170deg,#17191d,#0f1013)]">
                      <span className={stamp}>{t("queued")}</span>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {/* The bottom dissolves into the canvas: the stops are percentages, so the fade follows the real height. */}
        <div
          aria-hidden="true"
          data-testid="mesa-fade"
          className="absolute inset-x-[-15%] bottom-0 z-[6] h-[45%]"
          style={{ background: `linear-gradient(to bottom, transparent, var(--canvas) ${large ? "92%" : "78%"})` }}
        />
      </div>
    </div>
  );

  // The fade and the rotated cards reach past the mesa's own width, and what reaches past the conversation's makes it slide
  // sideways: it is clipped at the width of the conversation, here, so nothing the cards do can widen the scroll region.
  if (!pinned) return <div className="overflow-x-clip">{mesa}</div>;
  return (
    // The dissolve below the fan is part of the layout, and the next row is pulled back over most of it (-mb-4): at rest
    // the conversation starts just under the dissolve, so it only ever fades what has scrolled up under the mesa.
    // It sticks only where there is room left for the card being answered: on a window shorter than 600 px (a phone on its
    // side, for one) the fan would take the whole scroll region, so there it scrolls with the conversation. The
    // conversation measures it (data-mesa-pin) to keep the card being answered, and whatever takes focus, out from behind it.
    <div data-testid="mesa-pin" data-mesa-pin="" className="top-0 z-[8] -mb-4 overflow-x-clip [@media(min-height:600px)]:sticky">
      <div className="bg-[var(--canvas)]">{mesa}</div>
      <div
        aria-hidden="true"
        data-testid="mesa-pin-edge"
        className="pointer-events-none h-7"
        style={{ background: "linear-gradient(to bottom, var(--canvas), transparent)" }}
      />
    </div>
  );
}

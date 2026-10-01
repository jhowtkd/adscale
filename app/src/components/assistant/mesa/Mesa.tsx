"use client";

// The mesa (v4): a fan of up to five equal cards, rotated up to 8° with a soft shadow, at the top of the main
// conversation. Large while the conversation is just opening (H1), compact after (H2). The bottom dissolves into the
// canvas by a percentage mask, so the fade follows the real height of the fan and no text ever sits over an image.

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { MesaCard } from "@/lib/equipe/mesa";

/** Slots of the fan, in percent of the fan's own box (design box 920 × 350, cards 200 × 250). */
const FAN = [
  { left: 2.2, top: 16.6, rotate: -8 },
  { left: 21.3, top: 8, rotate: -3 },
  { left: 40.4, top: 3.4, rotate: 0 },
  { left: 59.2, top: 9.1, rotate: 4 },
  { left: 77.7, top: 20, rotate: 8 },
] as const;

/** Which slots a fan with fewer than five cards uses, so a short fan stays centered. */
const SLOTS: Record<number, readonly number[]> = { 1: [2], 2: [1, 3], 3: [1, 2, 3], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4] };

const CARD_WIDTH = 21.7;
const stamp =
  "absolute left-[6%] top-[5%] z-10 rounded-full bg-black/55 px-[0.9em] py-[0.45em] font-mono uppercase tracking-[0.14em] text-white/95";

export default function Mesa({ cards, size }: { cards: MesaCard[]; size: "large" | "compact" }) {
  const t = useTranslations("assistant.mesa");
  const fan = cards.slice(0, 5);
  if (fan.length === 0) return null;
  const slots = SLOTS[fan.length]!;
  const large = size === "large";

  const originLabel = { site: t("fromSite"), instagram: t("fromInstagram"), user: t("fromYou") } as const;

  return (
    <div
      data-testid="mesa"
      data-size={size}
      data-cards={fan.length}
      className={cn("pointer-events-none mx-auto w-full select-none px-4", large ? "max-w-[920px] md:px-0" : "max-w-[712px]")}
    >
      <div
        className="relative w-full"
        style={{
          containerType: "inline-size",
          aspectRatio: "920 / 350",
          maxHeight: large ? undefined : "205px",
          // Rotated cards may reach past the sides; only the bottom is cut.
          clipPath: "inset(-20% -15% 0 -15%)",
        }}
      >
        <ul role="list" aria-label={t("label")} className="m-0 list-none p-0">
          {fan.map((card, index) => {
            const slot = FAN[slots[index]!]!;
            return (
              <li
                key={card.id}
                data-testid={`mesa-card-${card.kind}`}
                className="absolute"
                style={{
                  left: `${slot.left}%`,
                  top: `${slot.top}%`,
                  width: `${CARD_WIDTH}%`,
                  transform: `rotate(${slot.rotate}deg)`,
                  zIndex: index + 1,
                }}
              >
                <div
                  className="relative aspect-[4/5] w-full overflow-hidden shadow-[0_18px_36px_-10px_rgba(0,0,0,0.6)]"
                  style={{ borderRadius: "11% / 8.8%", fontSize: "max(6px, 1.05cqw)" }}
                >
                  {card.kind === "inspiration" ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={card.src} alt="" className="absolute inset-0 size-full object-cover" />
                      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/10" />
                      <span className={stamp}>{t("inspiration")}</span>
                      <p
                        className="absolute inset-x-[7%] bottom-[6%] z-10 font-bold leading-[1.1] text-white [text-wrap:balance]"
                        style={{ fontSize: "max(9px, 2cqw)" }}
                      >
                        {card.title}
                      </p>
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
                    <div className="absolute inset-0 grid place-items-center bg-[linear-gradient(160deg,#f6f1e8,#e9e1d4)] p-[12%]">
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
                      <span className="mt-[2%] font-mono uppercase tracking-[0.14em] text-white/45" style={{ fontSize: "max(6px, 0.9cqw)" }}>
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
}

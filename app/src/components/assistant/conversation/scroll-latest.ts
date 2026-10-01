// Where the pilot's conversation rests. It follows its newest part: the end of the list or, while the mesa is pinned at the
// top, the TOP of the newest card, just under the mesa, when the card is taller than the room the mesa leaves. Then the
// step ("Passo 3 de 6") and its first lines are in view and the buttons are a scroll below, instead of the card arriving
// cut at the top, behind the mesa. The scroll padding keeps whatever takes focus out from behind the mesa as well.
// Plain DOM on purpose: the pin and the cards say what they are by `data-mesa-pin` and `data-card-row`.

/** How far from the newest part the person may be and still count as following it (a card does not need to be exact). */
const FOLLOW_SLACK = 160;

/** What the pinned mesa covers at the top of the region: its wrapper's height while it sticks, nothing otherwise. */
export function pinnedInset(scroller: HTMLElement): number {
  const pin = scroller.querySelector<HTMLElement>("[data-mesa-pin]");
  return pin && getComputedStyle(pin).position === "sticky" ? pin.offsetHeight : 0;
}

/**
 * The box of the newest card, when its row is the last of the conversation (a streaming reply or a message of the person
 * comes after it otherwise). The speech above the box and the Strategist's name are not part of it.
 */
function newestCard(scroller: HTMLElement): HTMLElement | null {
  const rows = scroller.querySelectorAll<HTMLElement>("[data-card-row]");
  const row = rows[rows.length - 1];
  if (!row || row !== row.parentElement?.lastElementChild) return null;
  return row.querySelector<HTMLElement>("[data-card-box]") ?? row;
}

/** The scrollTop at which the newest part of the conversation is in view. */
export function latestScrollTop(scroller: HTMLElement): number {
  const end = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const inset = pinnedInset(scroller);
  const card = inset > 0 ? newestCard(scroller) : null;
  if (!card) return end;
  const box = card.getBoundingClientRect();
  const top = scroller.scrollTop + box.top - scroller.getBoundingClientRect().top; // where the card starts in the content
  const trailing = scroller.scrollHeight - (top + box.height); // what comes after it: the row's end, the list's padding
  // A card that fits in the room under the mesa rests at the end of the list, all of it in view.
  if (box.height + trailing <= scroller.clientHeight - inset) return end;
  // A taller one rests with its top just under the mesa: the step and its first lines, the buttons a scroll below.
  return Math.max(0, top - inset);
}

export function scrollToLatest(scroller: HTMLElement): void {
  scroller.scrollTop = latestScrollTop(scroller);
}

/** True while the person is at (or near) the newest part, so a new message moves the conversation and a scroll up to read does not. */
export function followsLatest(scroller: HTMLElement): boolean {
  return Math.abs(scroller.scrollTop - latestScrollTop(scroller)) < FOLLOW_SLACK;
}

/**
 * Keeps `scroll-padding-top` of the region at the height of the pinned mesa (0 when it does not stick, or there is none),
 * so the browser never scrolls a focused control to a place behind it. Follows the mesa as the window changes.
 * Returns what undoes it.
 */
export function followPinnedInset(scroller: HTMLElement): () => void {
  const apply = () => {
    const inset = pinnedInset(scroller);
    scroller.style.scrollPaddingTop = inset > 0 ? `${inset}px` : "";
  };
  apply();
  const pin = scroller.querySelector<HTMLElement>("[data-mesa-pin]");
  const observer = pin && typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
  if (pin) observer?.observe(pin);
  // Sticking depends on the window's height (a media query), which changes the inset without resizing the mesa.
  window.addEventListener("resize", apply);
  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", apply);
    scroller.style.scrollPaddingTop = "";
  };
}

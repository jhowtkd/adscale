import { afterEach, describe, expect, it, vi } from "vitest";
import { followGrowth, followPinnedInset, followsLatest, latestScrollTop, pinnedInset, scrollToLatest } from "./scroll-latest";

// jsdom has no layout, so the geometry is declared: a region of 500 px (top 100) scrolled by `scrollTop` over `content` px.
// A pinned mesa covers `inset` px of its top; the newest card starts at `cardTop` in the content and is `cardHeight` tall.
type World = { inset?: number; sticky?: boolean; cardTop?: number; cardHeight?: number; cardLast?: boolean; scrollTop?: number; content?: number };

function build({ inset = 210, sticky = true, cardTop = 600, cardHeight = 440, cardLast = true, scrollTop = 0, content = 1100 }: World = {}) {
  const scroller = document.createElement("div");
  let top = scrollTop;
  Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (value: number) => { top = Math.min(Math.max(0, value), content - 500); }, configurable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: content, configurable: true });
  Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
  scroller.getBoundingClientRect = () => ({ top: 100, bottom: 600, left: 0, right: 400, width: 400, height: 500, x: 0, y: 100, toJSON: () => ({}) });

  const pin = document.createElement("div");
  pin.setAttribute("data-mesa-pin", "");
  Object.defineProperty(pin, "offsetHeight", { value: inset, configurable: true });
  vi.spyOn(window, "getComputedStyle").mockImplementation(((element: Element) => ({ position: element === pin && sticky ? "sticky" : "static" })) as typeof window.getComputedStyle);
  scroller.append(pin);

  const list = document.createElement("div");
  const row = document.createElement("div");
  row.setAttribute("data-card-row", "");
  const box = document.createElement("div");
  box.setAttribute("data-card-box", "");
  // The card moves up as the region scrolls.
  box.getBoundingClientRect = () => ({ top: 100 + cardTop - top, bottom: 100 + cardTop - top + cardHeight, left: 0, right: 400, width: 400, height: cardHeight, x: 0, y: 100 + cardTop - top, toJSON: () => ({}) });
  row.append(box);
  list.append(row);
  if (!cardLast) list.append(document.createElement("div"));
  scroller.append(list);
  return { scroller, pin };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("pinnedInset", () => {
  it("is the height of the mesa's wrapper while it sticks", () => {
    expect(pinnedInset(build({ inset: 210 }).scroller)).toBe(210);
  });

  it("is nothing when the wrapper does not stick (a window too short) and when there is no pinned mesa", () => {
    expect(pinnedInset(build({ sticky: false }).scroller)).toBe(0);
    expect(pinnedInset(document.createElement("div"))).toBe(0);
  });
});

describe("latestScrollTop", () => {
  it("is the end of the list when no mesa is pinned: the conversation follows its last message", () => {
    expect(latestScrollTop(build({ sticky: false }).scroller)).toBe(600);
    expect(latestScrollTop(document.createElement("div"))).toBe(0);
  });

  it("puts the top of a card that does not fit just under the mesa, the step and its first lines in view", () => {
    // 440 + 60 after it = 500 > 500 - 210: it does not fit; its top (600) minus the mesa (210).
    const { scroller } = build({ cardTop: 600, cardHeight: 440, content: 1100 });
    expect(latestScrollTop(scroller)).toBe(390);
  });

  it("measures the card from where it is now, not from where the list started", () => {
    const { scroller } = build({ cardTop: 600, cardHeight: 440, content: 1100, scrollTop: 250 });
    expect(latestScrollTop(scroller)).toBe(390);
  });

  it("rests at the end of the list when the card fits in the room under the mesa, with all of it in view", () => {
    // 200 + 60 after it <= 500 - 210.
    const { scroller } = build({ cardTop: 840, cardHeight: 200, content: 1100 });
    expect(latestScrollTop(scroller)).toBe(600);
  });

  it("counts what comes after the card: one that fits without it but not with the list's padding is shown from its top", () => {
    // 270 fits in 290, but 270 + 60 after it does not.
    const { scroller } = build({ cardTop: 770, cardHeight: 270, content: 1100 });
    expect(latestScrollTop(scroller)).toBe(560);
  });

  it("goes to the end when something follows the card (a reply streaming in, a message of the person)", () => {
    expect(latestScrollTop(build({ cardLast: false }).scroller)).toBe(600);
  });

  it("never asks for less than the start of the list", () => {
    expect(latestScrollTop(build({ cardTop: 100, cardHeight: 900, content: 1100 }).scroller)).toBe(0);
  });
});

describe("scrollToLatest and followsLatest", () => {
  it("moves the region to the top of the card, and then reports that the person follows it", () => {
    const { scroller } = build({ cardTop: 600, cardHeight: 440, content: 1100 });
    scrollToLatest(scroller);
    expect(scroller.scrollTop).toBe(390);
    expect(followsLatest(scroller)).toBe(true);
  });

  it("still follows within 160 px of the card's top, and stops following past it: the person went to read", () => {
    const { scroller } = build({ cardTop: 600, cardHeight: 440, content: 1100 });
    scroller.scrollTop = 390 - 150;
    expect(followsLatest(scroller)).toBe(true);
    scroller.scrollTop = 390 - 200;
    expect(followsLatest(scroller)).toBe(false);
  });

  it("without a pinned mesa keeps the old rule: near the end follows, far from it does not", () => {
    const { scroller } = build({ sticky: false });
    scroller.scrollTop = 600 - 150;
    expect(followsLatest(scroller)).toBe(true);
    scroller.scrollTop = 600 - 200;
    expect(followsLatest(scroller)).toBe(false);
  });
});

describe("followPinnedInset", () => {
  it("keeps the region's scroll padding at the height of the pinned mesa, so a focused control is never scrolled behind it", () => {
    const { scroller } = build({ inset: 210 });
    const stop = followPinnedInset(scroller);
    expect(scroller.style.scrollPaddingTop).toBe("210px");
    stop();
    expect(scroller.style.scrollPaddingTop).toBe("");
  });

  it("clears the padding where the mesa does not stick, and follows the window as it changes", () => {
    const { scroller, pin } = build({ sticky: false });
    const stop = followPinnedInset(scroller);
    expect(scroller.style.scrollPaddingTop).toBe("");
    vi.spyOn(window, "getComputedStyle").mockImplementation(((element: Element) => ({ position: element === pin ? "sticky" : "static" })) as typeof window.getComputedStyle);
    window.dispatchEvent(new Event("resize"));
    expect(scroller.style.scrollPaddingTop).toBe("210px");
    stop();
    window.dispatchEvent(new Event("resize"));
    expect(scroller.style.scrollPaddingTop).toBe("");
  });

  it("follows the mesa's own size when the browser can observe it", () => {
    const observers: Array<{ callback: () => void; disconnect: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("ResizeObserver", class {
      disconnect = vi.fn();
      constructor(callback: () => void) { observers.push({ callback, disconnect: this.disconnect }); }
      observe() {}
    });
    try {
      const { scroller, pin } = build({ inset: 160 });
      const stop = followPinnedInset(scroller);
      expect(scroller.style.scrollPaddingTop).toBe("160px");
      Object.defineProperty(pin, "offsetHeight", { value: 132, configurable: true });
      observers[0]!.callback();
      expect(scroller.style.scrollPaddingTop).toBe("132px");
      stop();
      expect(observers[0]!.disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// Ticket 13, T1 of the screen review: the mesa of the Library phase mounts after the first scroll and pushes the card down; the conversation has to follow.
describe("followGrowth: the conversation follows what grows inside it while the person follows it", () => {
  type Callback = () => void;
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    observed = new Set<Element>();
    disconnected = false;
    constructor(readonly callback: Callback) { FakeResizeObserver.instances.push(this); }
    observe(element: Element) { this.observed.add(element); }
    disconnect() { this.observed.clear(); this.disconnected = true; }
    fire() { this.callback(); }
  }
  const resizer = () => FakeResizeObserver.instances.at(-1)!;
  const stubObservers = () => { FakeResizeObserver.instances = []; vi.stubGlobal("ResizeObserver", FakeResizeObserver); };
  afterEach(() => { vi.unstubAllGlobals(); });

  /** The scroller of `build`, without a pinned mesa (the Library phase): the newest part is the end of the list. */
  function world() {
    const { scroller } = build({ sticky: false, content: 1100, scrollTop: 0 });
    return scroller;
  }

  it("scrolls to the newest part when the content grows and the person is following", () => {
    stubObservers();
    const scroller = world();
    scroller.scrollTop = 0;
    followGrowth(scroller, () => true);
    resizer().fire();
    expect(scroller.scrollTop).toBe(600);
  });

  it("does nothing once the person scrolled up to read", () => {
    stubObservers();
    const scroller = world();
    scroller.scrollTop = 120;
    followGrowth(scroller, () => false);
    resizer().fire();
    expect(scroller.scrollTop).toBe(120);
  });

  it("asks the question again at every growth, not once", () => {
    stubObservers();
    const scroller = world();
    let following = false;
    followGrowth(scroller, () => following);
    resizer().fire();
    expect(scroller.scrollTop).toBe(0);
    following = true;
    resizer().fire();
    expect(scroller.scrollTop).toBe(600);
  });

  it("watches every child of the region, and the ones that arrive later (the mesa mounts after the list)", async () => {
    stubObservers();
    const scroller = world();
    followGrowth(scroller, () => true);
    expect([...resizer().observed]).toEqual([...scroller.children]);
    const mesa = document.createElement("div");
    scroller.prepend(mesa);
    await Promise.resolve(); // a MutationObserver reports in a microtask
    expect(resizer().observed.has(mesa)).toBe(true);
    expect(resizer().observed.size).toBe(scroller.children.length);
  });

  it("stops watching when it is stopped, and does not follow a growth after that", async () => {
    stubObservers();
    const scroller = world();
    const stop = followGrowth(scroller, () => true);
    stop();
    expect(resizer().disconnected).toBe(true);
    expect(resizer().observed.size).toBe(0);
    scroller.prepend(document.createElement("div"));
    await Promise.resolve();
    expect(resizer().observed.size).toBe(0);
  });

  it("is a no-op where there is no ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const scroller = world();
    expect(() => followGrowth(scroller, () => true)()).not.toThrow();
  });
});

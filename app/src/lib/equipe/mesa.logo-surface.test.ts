// The plate a logo card asks for travels with the logo (ticket 16): from the handoff's items and from the Library, never invented.
import { describe, expect, it } from "vitest";
import type { HandoffItem, HandoffState } from "@/server/equipe/domain/handoff";
import { handoffCards, libraryCards, type MesaCard } from "./mesa";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const logoItem = (n: number, extra: Partial<HandoffItem> = {}, origin: HandoffItem["origin"] = "site"): HandoffItem => ({ id: uuid(n), value: `https://origin.example/${n}.png`, origin, key: `k${n}`, ...extra });
const state = (patch: Partial<HandoffState> = {}): HandoffState => ({ step: "identity", version: 1, source: null, readingId: null, readsUsed: 0, reading: {}, captured: {}, decisions: {}, ...patch });
const identity = (logo: HandoffItem | null): HandoffState["decisions"] => ({ identity: { name: { id: "n", value: "Marca", origin: "site" }, logo, colors: [], fonts: [], paletteChoice: "site" } });
const logoCard = (cards: MesaCard[]) => cards.find((card): card is Extract<MesaCard, { kind: "logo" }> => card.kind === "logo");

describe("handoffCards: the logo card", () => {
  it.each(["dark", "light"] as const)("a captured logo with surface %s makes a card with it", surface => {
    const card = logoCard(handoffCards(state({ captured: { logo: [logoItem(1, { surface })] } })));
    expect(card).toEqual({ kind: "logo", id: uuid(1), src: `/api/workspace/assets/${uuid(1)}/file`, surface });
  });
  it("a draft upload with surface dark makes a dark card", () => {
    const card = logoCard(handoffCards(state({ decisions: { uploadedLogo: logoItem(2, { surface: "dark" }, "user") } })));
    expect(card).toMatchObject({ id: uuid(2), surface: "dark" });
  });
  it("a decided logo with surface dark makes a dark card", () => {
    const card = logoCard(handoffCards(state({ decisions: identity(logoItem(3, { surface: "dark" })) })));
    expect(card).toMatchObject({ id: uuid(3), surface: "dark" });
  });
  it("the order decided > draft > captured keeps the surface of the winning item", () => {
    const captured = logoItem(1, { surface: "dark" }), draft = logoItem(2, { surface: "light" }, "user"), decided = logoItem(3, {});
    expect(logoCard(handoffCards(state({ captured: { logo: [captured] } })))).toMatchObject({ id: uuid(1), surface: "dark" });
    expect(logoCard(handoffCards(state({ captured: { logo: [captured] }, decisions: { uploadedLogo: draft } })))).toMatchObject({ id: uuid(2), surface: "light" });
    // The decided logo wins, and has no surface: nothing is borrowed from the others.
    const winner = logoCard(handoffCards(state({ captured: { logo: [captured] }, decisions: { uploadedLogo: draft, ...identity(decided) } })))!;
    expect(winner.id).toBe(uuid(3));
    expect("surface" in winner).toBe(false);
  });
  it("a decision to have no logo shows none, even if the captured one has a surface", () => {
    expect(logoCard(handoffCards(state({ captured: { logo: [logoItem(1, { surface: "dark" })] }, decisions: identity(null) })))).toBeUndefined();
  });
  it.each([["purple"], ["DARK"], [""], [null], [1], [{}]] as unknown[][])("a surface that is not one (%j) is dropped", surface => {
    const card = logoCard(handoffCards(state({ captured: { logo: [logoItem(1, { surface: surface as never })] } })))!;
    expect(card.id).toBe(uuid(1));
    expect("surface" in card).toBe(false);
  });
  it("without a surface the card has exactly the shape it always had", () => {
    expect(logoCard(handoffCards(state({ captured: { logo: [logoItem(1)] } })))).toEqual({ kind: "logo", id: uuid(1), src: `/api/workspace/assets/${uuid(1)}/file` });
  });
  it("a logo without a managed copy is no card, whatever its surface (nothing about the plate decides that)", () => {
    expect(logoCard(handoffCards(state({ captured: { logo: [{ ...logoItem(1, { surface: "dark" }), key: undefined }] } })))).toBeUndefined();
  });
  it("the surface of a logo never leaks to the other cards", () => {
    const cards = handoffCards(state({ captured: { logo: [logoItem(1, { surface: "dark" })], colors: [{ id: "c", value: "#112233", origin: "site" }] } }));
    for (const card of cards.filter(c => c.kind !== "logo")) expect("surface" in card).toBe(false);
  });
});

describe("libraryCards: the logo card", () => {
  it.each(["dark", "light"] as const)("keeps the surface %s of the Library's logo", surface => {
    expect(logoCard(libraryCards({ logo: { id: "l", src: "/l.png", surface }, colors: [], photos: [] }))).toEqual({ kind: "logo", id: "l", src: "/l.png", surface });
  });
  it("without a surface the card is {kind, id, src} only", () => {
    expect(logoCard(libraryCards({ logo: { id: "l", src: "/l.png" }, colors: [], photos: [] }))).toEqual({ kind: "logo", id: "l", src: "/l.png" });
  });
  it("no logo, no card", () => {
    expect(logoCard(libraryCards({ logo: null, colors: ["#111111"], photos: [] }))).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import type { HandoffItem, HandoffState } from "@/server/equipe/domain/handoff";
import {
  arrangeFan,
  handoffCards,
  hasConfirmedInstagram,
  inspirationCards,
  isFirstOpen,
  libraryCards,
  mesaImageSource,
  mesaPhase,
  mesaSizeFor,
  orderPhotos,
  type MesaCard,
  type MesaPhoto,
} from "./mesa";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const photo = (n: number, origin: MesaPhoto["origin"]): MesaPhoto => ({ id: `p${n}`, src: `/img/${n}`, origin });
const image = (n: number, origin: HandoffItem["origin"], managed = true): HandoffItem => ({
  id: uuid(n), value: `https://origin.example/${n}.jpg`, origin, ...(managed ? { key: `k${n}` } : {}),
});
const color = (value: string, origin: HandoffItem["origin"] = "site"): HandoffItem => ({ id: `c-${value}`, value, origin });

function state(patch: Partial<HandoffState> = {}): HandoffState {
  return { step: "source", version: 1, source: null, readingId: null, readsUsed: 0, reading: {}, captured: {}, decisions: {}, ...patch };
}
const run = (status: "pending" | "running" | "found" | "not_found" | "failed") => ({ runId: "r", taskIntentId: "t", status });

describe("orderPhotos", () => {
  it("puts the site first, then the Instagram, then what the person sent", () => {
    const ordered = orderPhotos([photo(1, "user"), photo(2, "instagram"), photo(3, "site")]);
    expect(ordered.map((item) => item.origin)).toEqual(["site", "instagram", "user"]);
  });

  it("fills with a second site photo when there is only one Instagram post", () => {
    const ordered = orderPhotos([photo(1, "site"), photo(2, "site"), photo(3, "instagram")]);
    expect(ordered.map((item) => item.id)).toEqual(["p1", "p3", "p2"]);
  });

  it("never returns more than three photos", () => {
    const many = [1, 2, 3, 4, 5].map((n) => photo(n, "site"));
    expect(orderPhotos(many).map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
    const mixed = [photo(1, "site"), photo(2, "instagram"), photo(3, "instagram"), photo(4, "instagram"), photo(5, "user")];
    expect(orderPhotos(mixed)).toHaveLength(3);
  });

  it("drops duplicates by id", () => {
    const ordered = orderPhotos([photo(1, "site"), photo(1, "site"), photo(2, "site")]);
    expect(ordered.map((item) => item.id)).toEqual(["p1", "p2"]);
  });

  it("returns nothing for nothing", () => {
    expect(orderPhotos([])).toEqual([]);
  });
});

describe("mesaImageSource", () => {
  it("serves only our managed copy, never the address it was read from", () => {
    const item = image(1, "site");
    expect(mesaImageSource(item)).toBe(`/api/workspace/assets/${uuid(1)}/file`);
    expect(mesaImageSource(item)).not.toContain("origin.example");
  });

  it("returns null without a managed key", () => {
    expect(mesaImageSource({ id: uuid(1), key: undefined })).toBeNull();
    expect(mesaImageSource({ id: uuid(1), key: "" })).toBeNull();
  });

  it("returns null when the id is not a UUID, so it cannot build an arbitrary path", () => {
    expect(mesaImageSource({ id: "not-a-uuid", key: "k" })).toBeNull();
    expect(mesaImageSource({ id: "../../etc/passwd/../../../x12345678901234", key: "k" })).toBeNull();
  });
});

describe("hasConfirmedInstagram", () => {
  it("is false before the person confirmed an Instagram profile", () => {
    expect(hasConfirmedInstagram({ source: { kind: "site", value: "a.com", normalized: "a.com" }, decisions: {} })).toBe(false);
    expect(hasConfirmedInstagram({ source: null, decisions: { networks: [{ id: "n", value: "x", origin: "site", platform: "facebook" }] } })).toBe(false);
  });

  it("is true when the Instagram is the source of the reading", () => {
    expect(hasConfirmedInstagram({ source: { kind: "instagram", value: "@a", normalized: "a" }, decisions: {} })).toBe(true);
  });

  it("is true when an Instagram profile is among the confirmed networks", () => {
    expect(hasConfirmedInstagram({ source: null, decisions: { networks: [{ id: "n", value: "x", origin: "site", platform: "instagram" }] } })).toBe(true);
  });
});

describe("isFirstOpen and mesaPhase", () => {
  it("treats a missing handoff as the first open", () => {
    expect(isFirstOpen(null)).toBe(true);
    expect(isFirstOpen(undefined)).toBe(true);
    expect(mesaPhase(undefined)).toBe("inspirations");
  });

  it("is the first open only on the source step with nothing captured or decided", () => {
    expect(isFirstOpen(state())).toBe(true);
    expect(isFirstOpen(state({ captured: { logo: [] } }))).toBe(true);
    expect(isFirstOpen(state({ captured: { images: [image(1, "site")] } }))).toBe(false);
    expect(isFirstOpen(state({ decisions: { networks: [] } }))).toBe(false);
    expect(isFirstOpen(state({ decisions: { images: { kept: [], removed: [], uploaded: [] } } }))).toBe(false);
    expect(isFirstOpen(state({ step: "reading" }))).toBe(false);
  });

  it.each(["reading", "identity", "networks", "images", "summary"] as const)("is the handoff phase on step %s", (step) => {
    expect(mesaPhase(state({ step }))).toBe("handoff");
  });

  it("is the library phase once the handoff is done, even with nothing captured", () => {
    expect(mesaPhase(state({ step: "done" }))).toBe("library");
  });

  it("stays on inspirations on the source step until something is read", () => {
    expect(mesaPhase(state())).toBe("inspirations");
    expect(mesaPhase(state({ captured: { colors: [color("#fff")] } }))).toBe("handoff");
  });
});

describe("inspirationCards", () => {
  it("keeps only the first five and only those with a preview", () => {
    const cards = inspirationCards([
      { id: "a", previewUrl: "/a" },
      { id: "b", previewUrl: null },
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `x${n}`, previewUrl: `/x${n}` })),
    ]);
    expect(cards.map((card) => card.id)).toEqual(["a", "x1", "x2", "x3", "x4"]);
    expect(cards[0]).toEqual({ kind: "inspiration", id: "a", src: "/a" });
  });

  it("ignores a title the item still carries: the card has no title key", () => {
    // Items from the catalog still come with the file name as their title.
    const items = [{ id: "a", title: "447c801d4edf3e0f9a5c", previewUrl: "/a" }];
    const [card] = inspirationCards(items);
    expect(card).toEqual({ kind: "inspiration", id: "a", src: "/a" });
    expect(Object.keys(card!)).toEqual(["kind", "id", "src"]);
    expect(JSON.stringify(card)).not.toContain("447c801d");
  });

  it("returns an empty list for no inspirations", () => {
    expect(inspirationCards([])).toEqual([]);
  });
});

describe("arrangeFan", () => {
  const ph = (n: number): MesaCard => ({ kind: "photo", id: `p${n}`, src: `/${n}`, origin: "site" });
  const logo: MesaCard = { kind: "logo", id: "l", src: "/l" };
  const palette: MesaCard = { kind: "palette", id: "palette", colors: ["#000"] };

  it("orders photo, logo, photo, palette, photo", () => {
    expect(arrangeFan({ photos: [ph(1), ph(2), ph(3)], logo, palette }).map((card) => card.kind))
      .toEqual(["photo", "logo", "photo", "palette", "photo"]);
  });

  it("drops what does not exist without leaving gaps", () => {
    expect(arrangeFan({ photos: [ph(1), ph(2)], logo: null, palette }).map((card) => card.kind)).toEqual(["photo", "photo", "palette"]);
    expect(arrangeFan({ photos: [], logo, palette: null }).map((card) => card.kind)).toEqual(["logo"]);
    expect(arrangeFan({ photos: [] })).toEqual([]);
  });
});

describe("handoffCards", () => {
  const siteImages = [image(1, "site"), image(2, "site")];
  const igImage = image(3, "instagram");

  it("shows no Instagram post before the profile is confirmed", () => {
    const cards = handoffCards(state({ source: { kind: "site", value: "a.com", normalized: "a.com" }, captured: { images: [...siteImages, igImage] } }));
    expect(cards.filter((card) => card.kind === "photo").map((card) => card.id)).toEqual([uuid(1), uuid(2)]);
  });

  it("shows Instagram posts once the profile is confirmed in the networks", () => {
    const cards = handoffCards(state({
      captured: { images: [...siteImages, igImage] },
      decisions: { networks: [{ id: "n", value: "@a", origin: "site", platform: "instagram" }] },
    }));
    expect(cards.filter((card) => card.kind === "photo").map((card) => card.id)).toEqual([uuid(1), uuid(3), uuid(2)]);
  });

  it("shows Instagram posts when the source of the reading is the Instagram", () => {
    const cards = handoffCards(state({ source: { kind: "instagram", value: "@a", normalized: "a" }, captured: { images: [igImage] } }));
    expect(cards).toEqual([{ kind: "photo", id: uuid(3), src: `/api/workspace/assets/${uuid(3)}/file`, origin: "instagram" }]);
  });

  it("leaves out images the person removed", () => {
    const cards = handoffCards(state({
      captured: { images: siteImages },
      decisions: { images: { kept: [uuid(2)], removed: [uuid(1)], uploaded: [] } },
    }));
    expect(cards.filter((card) => card.kind === "photo").map((card) => card.id)).toEqual([uuid(2)]);
  });

  it("never turns an unmanaged item (no key) or a non-UUID id into a photo", () => {
    const cards = handoffCards(state({
      captured: { images: [image(1, "site", false), { id: "abc", value: "https://x/y.jpg", origin: "site", key: "k" }, image(2, "site")] },
    }));
    expect(cards.filter((card) => card.kind === "photo").map((card) => card.id)).toEqual([uuid(2)]);
    expect(JSON.stringify(cards)).not.toContain("https://");
  });

  it("counts what the person uploaded, in the images step and as a draft, but only one slot goes to the person's photos", () => {
    const cards = handoffCards(state({
      captured: { images: [image(1, "site")] },
      decisions: { images: { kept: [], removed: [], uploaded: [image(2, "user")] }, uploadedImages: [image(4, "user")] },
    }));
    expect(cards.filter((card) => card.kind === "photo").map((card) => card.id)).toEqual([uuid(1), uuid(2)]);
  });

  it("deduplicates the same image by id and caps the photos at three", () => {
    const four = [1, 2, 3, 4].map((n) => image(n, "site"));
    const cards = handoffCards(state({ captured: { images: [...four, four[0]] } }));
    expect(cards.filter((card) => card.kind === "photo")).toHaveLength(3);
  });

  it("shows queued cards for the photo slots while the images are still being read", () => {
    const cards = handoffCards(state({ step: "reading", reading: { images: run("running") }, captured: { images: [image(1, "site")] } }));
    expect(cards.filter((card) => card.kind === "photo")).toHaveLength(1);
    expect(cards.filter((card) => card.kind === "queued")).toEqual([
      { kind: "queued", id: "queued-images-1", group: "images" },
      { kind: "queued", id: "queued-images-2", group: "images" },
    ]);
  });

  it("treats pending like running, and shows no queued photos once the group finished", () => {
    expect(handoffCards(state({ reading: { images: run("pending") } })).filter((card) => card.kind === "queued")).toHaveLength(3);
    expect(handoffCards(state({ reading: { images: run("found") } })).filter((card) => card.kind === "queued")).toHaveLength(0);
    expect(handoffCards(state({ reading: { images: run("failed") } })).filter((card) => card.kind === "queued")).toHaveLength(0);
  });

  it("shows queued logo and palette cards while those groups are being read", () => {
    const cards = handoffCards(state({ reading: { logo: run("running"), colors: run("pending") } }));
    expect(cards).toEqual([
      { kind: "queued", id: "queued-logo", group: "logo" },
      { kind: "queued", id: "queued-colors", group: "colors" },
    ]);
  });

  it("takes the captured logo that has a managed copy, ignoring one without a key", () => {
    const cards = handoffCards(state({ captured: { logo: [image(1, "site", false), image(2, "site")] } }));
    expect(cards).toEqual([{ kind: "logo", id: uuid(2), src: `/api/workspace/assets/${uuid(2)}/file` }]);
  });

  it("prefers the logo the person uploaded over the captured one, and the decided identity over both", () => {
    const captured = { logo: [image(1, "site")] };
    expect(handoffCards(state({ captured, decisions: { uploadedLogo: image(2, "user") } })))
      .toEqual([{ kind: "logo", id: uuid(2), src: `/api/workspace/assets/${uuid(2)}/file` }]);
    const decided = handoffCards(state({
      captured,
      decisions: {
        uploadedLogo: image(2, "user"),
        identity: { name: { id: "n", value: "Acme", origin: "site" }, logo: image(5, "site"), colors: [], fonts: [], paletteChoice: "site" },
      },
    }));
    expect(decided).toEqual([{ kind: "logo", id: uuid(5), src: `/api/workspace/assets/${uuid(5)}/file` }]);
  });

  it("shows no logo when the identity decision has none", () => {
    const cards = handoffCards(state({
      captured: { logo: [image(1, "site")] },
      decisions: { identity: { name: { id: "n", value: "Acme", origin: "site" }, logo: null, colors: [], fonts: [], paletteChoice: "site" } },
    }));
    expect(cards).toEqual([]);
  });

  it("builds the palette from the captured colors of the reading origin, six at most", () => {
    const colors = ["#111", "#222", "#333", "#444", "#555", "#666", "#777"].map((value) => color(value));
    const cards = handoffCards(state({ captured: { colors: [...colors, color("#abc", "instagram")] } }));
    expect(cards).toEqual([{ kind: "palette", id: "palette", colors: ["#111", "#222", "#333", "#444", "#555", "#666"] }]);
  });

  it("uses the colors of the Instagram when it is the source", () => {
    const cards = handoffCards(state({
      source: { kind: "instagram", value: "@a", normalized: "a" },
      captured: { colors: [color("#111", "site"), color("#abc", "instagram")] },
    }));
    expect(cards).toEqual([{ kind: "palette", id: "palette", colors: ["#abc"] }]);
  });

  it("uses the decided palette, and the paletteChoice origin wins over the captured ones", () => {
    const cards = handoffCards(state({
      captured: { colors: [color("#111", "site")] },
      decisions: { identity: { name: { id: "n", value: "Acme", origin: "site" }, logo: null, colors: [color("#999", "instagram")], fonts: [], paletteChoice: "instagram" } },
    }));
    expect(cards).toEqual([{ kind: "palette", id: "palette", colors: ["#999"] }]);
  });

  it("arranges the full fan: photo, logo, photo, palette, photo", () => {
    const cards = handoffCards(state({
      captured: { images: [image(1, "site"), image(2, "site"), image(3, "site")], logo: [image(4, "site")], colors: [color("#111")] },
    }));
    expect(cards.map((card) => card.kind)).toEqual(["photo", "logo", "photo", "palette", "photo"]);
  });

  it("returns nothing for an empty handoff", () => {
    expect(handoffCards(state())).toEqual([]);
  });
});

describe("libraryCards", () => {
  it("arranges photos, logo and palette, leaving out the missing ones", () => {
    const cards = libraryCards({
      logo: { id: "l", src: "/l" },
      colors: ["#1", "#2", "#3", "#4", "#5", "#6", "#7"],
      photos: [photo(1, "site"), photo(2, "instagram")],
    });
    expect(cards.map((card) => card.kind)).toEqual(["photo", "logo", "photo", "palette"]);
    expect(cards[3]).toEqual({ kind: "palette", id: "palette", colors: ["#1", "#2", "#3", "#4", "#5", "#6"] });
  });

  it("returns an empty fan for an empty Library", () => {
    expect(libraryCards({ logo: null, colors: [], photos: [] })).toEqual([]);
  });
});

describe("mesaSizeFor", () => {
  const opening = { type: "assistant", payload: { handoffStep: "intro" } };
  const sourceCard = { type: "equipe_card", payload: { kind: "handoff", step: "source" } };

  it("is large with only the opening line and the first source card, or with nothing yet", () => {
    expect(mesaSizeFor([])).toBe("large");
    expect(mesaSizeFor([opening])).toBe("large");
    expect(mesaSizeFor([opening, sourceCard])).toBe("large");
  });

  it("is compact as soon as anything else happens", () => {
    expect(mesaSizeFor([opening, sourceCard, { type: "user", payload: { text: "oi" } }])).toBe("compact");
    expect(mesaSizeFor([opening, { type: "assistant", payload: { text: "outra fala" } }])).toBe("compact");
    expect(mesaSizeFor([opening, { type: "equipe_card", payload: { kind: "handoff", step: "identity" } }])).toBe("compact");
    expect(mesaSizeFor([opening, { type: "equipe_card", payload: { kind: "diagnosis", step: "source" } }])).toBe("compact");
  });
});

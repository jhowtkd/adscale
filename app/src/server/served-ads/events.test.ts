import { describe, expect, it } from "vitest";
import {
  describeEvent,
  KNOWN_CONVERSION_EVENTS,
  listAvailableEvents,
  normalizeEventParam,
} from "./events";

describe("served-ads events (ICE-01B)", () => {
  it("normalizeEventParam: vazio vira não escolhido, sem adivinhar", () => {
    expect(normalizeEventParam(null)).toBeNull();
    expect(normalizeEventParam(undefined)).toBeNull();
    expect(normalizeEventParam("")).toBeNull();
    expect(normalizeEventParam("   ")).toBeNull();
    expect(normalizeEventParam("  purchase ")).toBe("purchase");
    expect(normalizeEventParam(42)).toBeNull();
  });

  it("describeEvent: tipo conhecido ganha rótulo compreensível por locale", () => {
    expect(describeEvent("purchase", "pt-BR")).toEqual({
      actionType: "purchase",
      label: "Compra",
      known: true,
    });
    expect(describeEvent("purchase", "en")).toEqual({
      actionType: "purchase",
      label: "Purchase",
      known: true,
    });
    expect(describeEvent("complete_registration", "pt-BR").label).toBe("Cadastro concluído");
  });

  it("describeEvent: tipo desconhecido ecoa o tipo cru, nunca inventa rótulo", () => {
    expect(describeEvent("offsite_conversion.fb_pixel_custom_xyz", "pt-BR")).toEqual({
      actionType: "offsite_conversion.fb_pixel_custom_xyz",
      label: "offsite_conversion.fb_pixel_custom_xyz",
      known: false,
    });
  });

  it("describeEvent: texto de campanha nunca vira evento", () => {
    // Mesmo que o texto mencione "compra", sem tipo explícito não há evento.
    expect(describeEvent("", "pt-BR")).toEqual({ actionType: "", label: "", known: false });
  });

  it("listAvailableEvents: união ordenada dos mapas observados, sem duplicar", () => {
    const options = listAvailableEvents(
      [{ purchase: 4, lead: 10 }, null, undefined, { purchase: 1, view_content: 7 }],
      "pt-BR"
    );
    expect(options.map((o) => o.actionType)).toEqual(["lead", "purchase", "view_content"]);
    expect(options.find((o) => o.actionType === "purchase")).toMatchObject({
      label: "Compra",
      known: true,
    });
  });

  it("listAvailableEvents: escopo sem mapas não oferece eventos", () => {
    expect(listAvailableEvents([null, undefined])).toEqual([]);
    expect(listAvailableEvents([])).toEqual([]);
  });

  it("catálogo conhecido não presume equivalência: cada tipo é uma entrada própria", () => {
    const types = KNOWN_CONVERSION_EVENTS.map((entry) => entry.actionType);
    expect(new Set(types).size).toBe(types.length);
    // purchase e onsite_conversion.purchase são eventos distintos, sem alias implícito.
    expect(types).toContain("purchase");
  });
});

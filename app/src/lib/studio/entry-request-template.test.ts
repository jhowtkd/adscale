import { describe, expect, it } from "vitest";
import { formatEntryRequestTemplate } from "./entry-request-template";

describe("formatEntryRequestTemplate", () => {
  it("omits null slots and uses localized protocol labels", () => {
    expect(formatEntryRequestTemplate({
      protocol: "single",
      offer: "imersão NR-1",
      audience: null,
      tone: "institucional",
    }, "pt-BR")).toBe("Peça única de imersão NR-1, tom institucional.");
  });

  it("returns empty string when every slot is empty", () => {
    expect(formatEntryRequestTemplate({
      protocol: null, offer: null, audience: null, tone: null,
    }, "pt-BR")).toBe("");
  });
});

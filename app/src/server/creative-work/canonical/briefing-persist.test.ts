import { describe, expect, it } from "vitest";
import {
  socialPostCopyToBriefingWrite,
  toSocialPostBrief,
  toSocialPostCopy,
} from "./briefing-persist";

describe("toSocialPostBrief", () => {
  it("maps canonical theme/audience/offer + objective", () => {
    expect(
      toSocialPostBrief({
        theme: "Lançamento",
        audience: "Founders",
        offer: "Webinar",
        objective: "Engajamento",
      })
    ).toEqual({
      theme: "Lançamento",
      audience: "Founders",
      offer: "Webinar",
      objective: "Engajamento",
    });
  });

  it("fills gaps from existing brief", () => {
    expect(
      toSocialPostBrief(
        { theme: "Novo tema" },
        {
          theme: "Velho",
          objective: "Obj",
          audience: "Aud",
          offer: "Oferta",
        }
      )
    ).toEqual({
      theme: "Novo tema",
      objective: "Obj",
      audience: "Aud",
      offer: "Oferta",
    });
  });

  it("rejects empty required fields", () => {
    expect(() => toSocialPostBrief({ theme: "x" })).toThrow();
  });
});

describe("toSocialPostCopy", () => {
  it("maps headline/body/cta", () => {
    expect(
      toSocialPostCopy({
        headline: "H",
        body: "B",
        cta: "C",
      })
    ).toEqual({ headline: "H", body: "B", cta: "C" });
  });

  it("merges with existing copy", () => {
    expect(
      toSocialPostCopy(
        { headline: "New" },
        { headline: "Old", body: "Body", cta: "CTA" }
      )
    ).toEqual({ headline: "New", body: "Body", cta: "CTA" });
  });
});

describe("socialPostCopyToBriefingWrite", () => {
  it("lifts legacy copy into briefing write fields", () => {
    expect(
      socialPostCopyToBriefingWrite({
        headline: "H",
        body: "B",
        cta: "C",
      })
    ).toEqual({ headline: "H", body: "B", cta: "C" });
  });
});

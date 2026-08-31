import { afterEach, describe, expect, it } from "vitest";
import { CAROUSEL_SLIDE_GENERATE_EVENT, heavyImageEventName } from "./heavy-image-events";

const previousTarget = process.env.IMAGE_JOB_TARGET;

afterEach(() => {
  if (previousTarget === undefined) {
    delete process.env.IMAGE_JOB_TARGET;
  } else {
    process.env.IMAGE_JOB_TARGET = previousTarget;
  }
});

describe("carousel slide generate event", () => {
  it("exposes the stable event base name", () => {
    expect(CAROUSEL_SLIDE_GENERATE_EVENT).toBe("creative-work.carousel-slide.generate");
  });

  it("resolves through the heavy image runtime for the web target", () => {
    process.env.IMAGE_JOB_TARGET = "web";
    expect(heavyImageEventName(CAROUSEL_SLIDE_GENERATE_EVENT)).toBe(
      "creative-work.carousel-slide.generate",
    );
  });

  it("resolves through the heavy image runtime for the worker target", () => {
    process.env.IMAGE_JOB_TARGET = "worker";
    expect(heavyImageEventName(CAROUSEL_SLIDE_GENERATE_EVENT)).toBe(
      "creative-work.carousel-slide.generate.v2",
    );
  });
});

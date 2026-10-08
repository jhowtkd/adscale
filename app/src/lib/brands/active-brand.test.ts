import { afterEach, describe, expect, it } from "vitest";
import { ACTIVE_BRAND_COOKIE, pickActiveBrand, writeActiveBrandCookie } from "./active-brand";

const brand = (id: string, name: string, day: number) => ({ id, name, createdAt: new Date(Date.UTC(2026, 0, day)) });
const CAFE = brand("b-cafe", "Café Aurora", 2);
const LIVRARIA = brand("b-livraria", "Livraria Norte", 1);
const STUDIO = brand("b-studio", "Studio Lume", 3);

describe("pickActiveBrand (spec 2026-10-07 §3)", () => {
  it("is null without brands", () => {
    expect(pickActiveBrand([], "b-cafe", null)).toBeNull();
  });

  it("takes the cookie's brand when it is one of the workspace's", () => {
    expect(pickActiveBrand([CAFE, LIVRARIA, STUDIO], "b-studio", null)).toEqual({ id: "b-studio", name: "Studio Lume" });
  });

  it("falls back to the oldest brand without a cookie or with one from elsewhere", () => {
    expect(pickActiveBrand([CAFE, LIVRARIA, STUDIO], undefined, null)).toEqual({ id: "b-livraria", name: "Livraria Norte" });
    expect(pickActiveBrand([CAFE, LIVRARIA, STUDIO], "b-other-workspace", null)).toEqual({ id: "b-livraria", name: "Livraria Norte" });
  });

  it("keeps the free plan on its account's brand, whatever the cookie says", () => {
    expect(pickActiveBrand([CAFE, LIVRARIA], "b-livraria", "b-cafe")).toEqual({ id: "b-cafe", name: "Café Aurora" });
  });
});

describe("writeActiveBrandCookie", () => {
  afterEach(() => { document.cookie = `${ACTIVE_BRAND_COOKIE}=; path=/; max-age=0`; });

  it("leaves the brand where the next server render reads it", () => {
    writeActiveBrandCookie("b-cafe");
    expect(document.cookie).toContain(`${ACTIVE_BRAND_COOKIE}=b-cafe`);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEquipeNavLinks } from "./EquipeNavLinks";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `navigation.${key}`,
}));

let searchString = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(searchString),
}));

describe("useEquipeNavLinks", () => {
  beforeEach(() => {
    searchString = "";
  });

  it("exposes the three client destinations, for every workspace and at once", () => {
    const { result } = renderHook(() => useEquipeNavLinks());
    expect(result.current.map((link) => link.href)).toEqual(["/pipeline", "/ideas", "/goals"]);
    expect(result.current[0]!.label).toBe("navigation.pipeline");
  });

  it("carries the chosen account across the three destinations", () => {
    searchString = "account=acc-9";
    const { result } = renderHook(() => useEquipeNavLinks());
    expect(result.current.map((link) => link.href)).toEqual([
      "/pipeline?account=acc-9",
      "/ideas?account=acc-9",
      "/goals?account=acc-9",
    ]);
  });
});

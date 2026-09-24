import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useScrollDirection } from "./use-scroll-direction";

describe("useScrollDirection", () => {
  const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, "scrollY");

  afterEach(() => {
    if (scrollYDescriptor) Object.defineProperty(window, "scrollY", scrollYDescriptor);
    vi.restoreAllMocks();
  });

  it("keeps one listener while reporting upward and downward scroll", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    const { result, rerender, unmount } = renderHook(() => useScrollDirection());

    Object.defineProperty(window, "scrollY", { configurable: true, value: 20 });
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(result.current).toBe("down");
    rerender();

    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(result.current).toBe("up");
    expect(add.mock.calls.filter(([type]) => type === "scroll")).toHaveLength(1);

    unmount();
    expect(remove.mock.calls.filter(([type]) => type === "scroll")).toHaveLength(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderHook } from "@testing-library/react";
import { useScrollDirection } from "./use-scroll-direction";

describe("useScrollDirection", () => {
  it("keeps one listener while direction changes", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { result, unmount } = renderHook(() => useScrollDirection());
    const scrollAdds = () => add.mock.calls.filter(([name]) => name === "scroll").length;
    expect(scrollAdds()).toBe(1);
    act(() => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 20 });
      fireEvent.scroll(window);
    });
    expect(result.current).toBe("down");
    act(() => {
      Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
      fireEvent.scroll(window);
    });
    expect(result.current).toBe("up");
    expect(scrollAdds()).toBe(1);
    unmount();
    expect(remove.mock.calls.filter(([name]) => name === "scroll")).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  });
});

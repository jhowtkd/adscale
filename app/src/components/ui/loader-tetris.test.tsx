import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TetrisLoader } from "./loader-tetris";

describe("TetrisLoader", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps a static board when reduced motion is requested", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(<TetrisLoader label="Fábrica criativa em atividade" />);
    const loader = screen.getByRole("img", { name: "Fábrica criativa em atividade" });
    const colors = () => Array.from(loader.children).map((cell) => cell.getAttribute("style"));
    const initial = colors();

    act(() => vi.advanceTimersByTime(2_000));

    expect(colors()).toEqual(initial);
  });
});

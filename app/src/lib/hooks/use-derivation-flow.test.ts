import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDerivationFlow, type DerivationIntent } from "./use-derivation-flow";

const INTENTS: DerivationIntent[] = [
  "manual_art",
  "auto_art",
  "single_format",
  "batch_format",
];

describe("useDerivationFlow", () => {
  it("starts with flow closed", () => {
    const { result } = renderHook(() => useDerivationFlow());

    expect(result.current.activeStep).toBeNull();
    expect(result.current.isChooserOpen).toBe(false);
    expect(result.current.isArtConfigOpen).toBe(false);
    expect(result.current.isFormatConfigOpen).toBe(false);
  });

  it("openChooser opens strategy recipe step and increments session", () => {
    const { result } = renderHook(() => useDerivationFlow());

    act(() => {
      result.current.openChooser();
    });

    expect(result.current.activeStep).toBe("strategy_recipe");
    expect(result.current.isStrategyRecipeOpen).toBe(true);
    expect(result.current.isChooserOpen).toBe(false);
    expect(result.current.strategyRecipeSession).toBe(1);

    act(() => {
      result.current.openChooser();
    });
    expect(result.current.strategyRecipeSession).toBe(2);
  });

  it.each(INTENTS)("selectIntent(%s) opens the correct config step", (intent) => {
    const { result } = renderHook(() => useDerivationFlow());

    act(() => {
      result.current.openLegacyChooser();
      result.current.selectIntent(intent);
    });

    expect(result.current.activeStep).toBe(intent);
    expect(result.current.selectedIntent).toBe(intent);
    expect(result.current.isChooserOpen).toBe(false);

    if (intent === "manual_art" || intent === "auto_art") {
      expect(result.current.isArtConfigOpen).toBe(true);
      expect(result.current.isFormatConfigOpen).toBe(false);
      expect(result.current.artConfigIntent).toBe(intent);
    } else {
      expect(result.current.isFormatConfigOpen).toBe(true);
      expect(result.current.isArtConfigOpen).toBe(false);
      expect(result.current.formatConfigIntent).toBe(intent);
    }
  });

  it("backToChooser returns from config to chooser", () => {
    const { result } = renderHook(() => useDerivationFlow());

    act(() => {
      result.current.selectIntent("manual_art");
      result.current.backToChooser();
    });

    expect(result.current.activeStep).toBe("chooser");
    expect(result.current.isChooserOpen).toBe(true);
    expect(result.current.selectedIntent).toBeNull();
  });

  it("closeFlow resets to null", () => {
    const { result } = renderHook(() => useDerivationFlow());

    act(() => {
      result.current.selectIntent("batch_format");
      result.current.closeFlow();
    });

    expect(result.current.activeStep).toBeNull();
    expect(result.current.isFormatConfigOpen).toBe(false);
  });

  it("only one surface is open at a time", () => {
    const { result } = renderHook(() => useDerivationFlow());

    act(() => {
      result.current.openChooser();
    });
    expect(result.current.isStrategyRecipeOpen).toBe(true);
    expect(result.current.isArtConfigOpen).toBe(false);

    act(() => {
      result.current.closeFlow();
      result.current.selectIntent("auto_art");
    });
    expect(result.current.isChooserOpen).toBe(false);
    expect(result.current.isArtConfigOpen).toBe(true);
    expect(result.current.isFormatConfigOpen).toBe(false);
  });
});

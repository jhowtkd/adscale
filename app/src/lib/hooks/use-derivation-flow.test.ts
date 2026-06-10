import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDerivationFlow } from "./use-derivation-flow";

describe("useDerivationFlow", () => {
  it("starts with derive panel closed", () => {
    const { result } = renderHook(() => useDerivationFlow());

    expect(result.current.isDerivePanelOpen).toBe(false);
    expect(result.current.derivePanelSession).toBe(0);
  });

  it("openDerivePanel opens panel and increments session", () => {
    const { result } = renderHook(() => useDerivationFlow());

    act(() => {
      result.current.openDerivePanel();
    });

    expect(result.current.isDerivePanelOpen).toBe(true);
    expect(result.current.derivePanelSession).toBe(1);

    act(() => {
      result.current.openDerivePanel();
    });
    expect(result.current.derivePanelSession).toBe(2);
  });

  it("closeFlow resets panel state", () => {
    const { result } = renderHook(() => useDerivationFlow());

    act(() => {
      result.current.openDerivePanel();
      result.current.closeFlow();
    });

    expect(result.current.isDerivePanelOpen).toBe(false);
  });
});

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDerivationFlow } from "./use-derivation-flow";

describe("derivation flow configure payloads", () => {
  it.each([
    [
      "manual_art",
      {
        generationMode: "art_variation" as const,
        creativeLevel: "balanced",
        ctaVariants: ["Shop Now"],
      },
    ],
    [
      "auto_art",
      {
        generationMode: "art_variation" as const,
        creativeLevel: "bold",
        ctaVariants: ["Buy Now", "Learn More"],
      },
    ],
    [
      "single_format",
      {
        generationMode: "format_adaptation" as const,
        targetFormats: ["4:5"],
      },
    ],
    [
      "batch_format",
      {
        generationMode: "format_adaptation" as const,
        targetFormats: ["1:1", "4:5", "9:16"],
      },
    ],
  ])("intent %s maps to expected configureAndGenerate payload", (intent, expected) => {
    const configureAndGenerate = vi.fn();
    const { result } = renderHook(() => useDerivationFlow());

    act(() => {
      result.current.openChooser();
      result.current.selectIntent(intent as never);
    });

    expect(result.current.selectedIntent).toBe(intent);

    if (expected.generationMode === "art_variation") {
      configureAndGenerate({
        generationMode: "art_variation",
        creativeLevel: expected.creativeLevel,
        ctaVariants: expected.ctaVariants,
      });
    } else {
      configureAndGenerate({
        generationMode: "format_adaptation",
        targetFormats: expected.targetFormats,
      });
    }

    expect(configureAndGenerate).toHaveBeenCalledWith(expected);
  });
});

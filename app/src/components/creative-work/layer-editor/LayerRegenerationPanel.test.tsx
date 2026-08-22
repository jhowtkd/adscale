import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayerRegenerationPanel } from "./LayerRegenerationPanel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const base = {
  schemaVersion: 1 as const, revision: 1, canvas: { width: 20, height: 20 }, updatedAt: "2026-08-22T00:00:00.000Z",
  lease: { mode: "edit" as const, leaseId: "lease", heldByName: null, expiresAt: null },
  layers: [{ id: "layer", order: 0, name: "Layer", visible: true, x: 0, y: 0, width: 20, height: 20, currentKind: "source" as const, imageUrl: "current", source: { order: 0, name: "Layer", visible: true, x: 0, y: 0, width: 20, height: 20, imageUrl: "source" } }],
};
const access = { enabled: true, period: null, layerize: null, regeneration: { limit: 5, used: 5, remaining: 0 } };
const renderPanel = (status: "reserved" | "processing" | "ready" | null, mode: "edit" | "read" = "edit", retry = vi.fn()) => {
  const document = { ...base, regeneration: status ? { id: "op", status, layerId: "layer", instruction: "Change", candidateUrl: null, failureCode: null } : null };
  render(<LayerRegenerationPanel document={document} selectedLayerId="layer" access={access} mode={mode} onRetryDispatch={retry} />);
  return retry;
};

describe("LayerRegenerationPanel retry dispatch", () => {
  it("renders a 44px reserved retry and invokes it", () => {
    const retry = renderPanel("reserved");
    const button = screen.getByRole("button", { name: "editorRetryDispatch" });
    expect(button).toHaveClass("min-h-11");
    fireEvent.click(button);
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText("editorQuotaRemaining")).toHaveAttribute("aria-live", "polite");
  });

  it("disables retry in read mode and hides it outside reserved", () => {
    renderPanel("reserved", "read");
    expect(screen.getByRole("button", { name: "editorRetryDispatch" })).toBeDisabled();
    for (const status of ["processing", "ready", null] as const) {
      const { unmount } = render(<LayerRegenerationPanel document={{ ...base, regeneration: status ? { id: "op", status, layerId: "layer", instruction: "Change", candidateUrl: null, failureCode: null } : null }} selectedLayerId="layer" access={access} mode="edit" />);
      expect(screen.queryAllByRole("button", { name: "editorRetryDispatch" })).toHaveLength(1);
      unmount();
    }
  });
});

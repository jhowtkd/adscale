import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayerRegenerationPanel } from "./LayerRegenerationPanel";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const base = {
  schemaVersion: 1 as const, revision: 1, canvas: { width: 20, height: 20 }, updatedAt: "2026-08-22T00:00:00.000Z",
  lease: { mode: "edit" as const, leaseId: "lease", heldByName: null, expiresAt: null },
  layers: [{ id: "layer", order: 0, name: "Layer", description: "Woman facing camera", visible: true, x: 0, y: 0, width: 20, height: 20, currentKind: "source" as const, imageUrl: "current", source: { order: 0, name: "Layer", visible: true, x: 0, y: 0, width: 20, height: 20, imageUrl: "source" } }],
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

  it("focuses once when pending regeneration becomes terminal", () => {
    const pending = { ...base, regeneration: { id: "op", status: "processing" as const, layerId: "layer", instruction: "Change", candidateUrl: null, failureCode: null } };
    const { rerender } = render(<LayerRegenerationPanel document={pending} selectedLayerId="layer" access={access} mode="edit" />);
    expect(window.document.activeElement).not.toHaveAttribute("aria-label", "editorRegenerate");
    const terminal = { ...pending, regeneration: { ...pending.regeneration, status: "failed" as const, failureCode: "provider_failure" } };
    rerender(<LayerRegenerationPanel document={terminal} selectedLayerId="layer" access={access} mode="edit" />);
    expect(window.document.activeElement).toHaveAttribute("aria-label", "editorRegenerate");
    const elsewhere = window.document.createElement("button"); window.document.body.append(elsewhere); elsewhere.focus();
    rerender(<LayerRegenerationPanel document={terminal} selectedLayerId="layer" access={access} mode="edit" />);
    expect(window.document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("sends an instruction with Enter when a layer is selected", () => {
    const onRegenerate = vi.fn();
    const available = { ...access, regeneration: { limit: 5, used: 1, remaining: 4 } };
    render(<LayerRegenerationPanel document={{ ...base, regeneration: null }} selectedLayerId="layer" access={available} mode="edit" onRegenerate={onRegenerate} />);
    fireEvent.change(screen.getByPlaceholderText("askAiPlaceholder"), { target: { value: "deixa ela séria" } });
    fireEvent.keyDown(screen.getByPlaceholderText("askAiPlaceholder"), { key: "Enter" });
    expect(onRegenerate).toHaveBeenCalledWith("layer", "deixa ela séria");
  });

  it("keeps the input disabled until a layer is selected", () => {
    render(<LayerRegenerationPanel document={{ ...base, regeneration: null }} selectedLayerId={null} access={{ ...access, regeneration: { limit: 5, used: 0, remaining: 5 } }} mode="edit" />);
    expect(screen.getByPlaceholderText("askAiPlaceholder")).toBeDisabled();
    expect(screen.getByText("editorSelectLayer")).toBeVisible();
  });

  it("does not steal focus for an initially terminal regeneration", () => {
    const initialTerminal = { ...base, regeneration: { id: "op", status: "ready" as const, layerId: "layer", instruction: "Change", candidateUrl: "candidate", failureCode: null } };
    render(<LayerRegenerationPanel document={initialTerminal} selectedLayerId="layer" access={access} mode="edit" />);
    expect(window.document.activeElement).not.toHaveAttribute("aria-label", "editorRegenerate");
  });
});

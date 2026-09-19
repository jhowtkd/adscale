import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdscaleGuestHome from "./AdscaleGuestHome";

vi.mock("./guest-store.mjs", () => ({
  saveDraft: vi.fn(async () => {}),
  loadDraft: vi.fn(async () => null),
  loadLastDraft: vi.fn(async () => null),
  removeDraft: vi.fn(async () => {}),
  pruneExpiredDrafts: vi.fn(async () => {}),
}));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({ matches: false }),
  });
  Element.prototype.scrollIntoView ??= () => {};
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdscaleGuestHome", () => {
  it("usa o landmark apontado pelo skip link global", () => {
    render(<AdscaleGuestHome preview attachmentsEnabled={false} />);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
    expect(
      screen.queryByRole("button", { name: /anexar/i }),
    ).toBeNull();
  });

  it("attachments off: honest guidance, official logo, editable examples", () => {
    render(<AdscaleGuestHome preview={false} attachmentsEnabled={false} />);
    expect(screen.getByText(/adicione referências depois, no estúdio/i)).toBeVisible();
    const logos = screen.getAllByRole("link", { name: "Adscale, início" });
    expect(logos.length).toBeGreaterThan(0);
    for (const logo of logos) {
      expect(logo.querySelector("img")).toHaveAttribute(
        "src",
        "/adscale-guest/logo.svg",
      );
    }
    expect(
      screen.getByRole("button", { name: /usar este exemplo/i }),
    ).toBeVisible();
    expect(screen.getByLabelText(/descreva o que você precisa criar/i)).toBeVisible();
  });

  it("makes zero private-data requests while visiting", async () => {
    const fetchSpy = vi
      .spyOn(window, "fetch")
      .mockRejectedValue(new Error("no network in test"));
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, "open");
    render(<AdscaleGuestHome preview={false} attachmentsEnabled={false} />);
    await screen.findByRole("main");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
  });

  it("forwards only allowlisted public events", async () => {
    const onEvent = vi.fn();
    const { unmount } = render(
      <AdscaleGuestHome preview={false} attachmentsEnabled={false} onEvent={onEvent} />,
    );
    await screen.findByRole("main");
    expect(onEvent).toHaveBeenCalledWith({
      name: "home_viewed",
      detail: { preview: false },
    });
    for (const call of onEvent.mock.calls) {
      expect(Object.keys(call[0].detail)).not.toContain("surface");
    }
    unmount();
  });
});

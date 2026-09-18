import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderShell } from "./guest-markup.mjs";
import { mountGuestHome } from "./guest-controller.mjs";
import type { GuestDraft } from "./guest-core.mjs";

const storeMocks = vi.hoisted(() => {
  const records = new Map<string, GuestDraft>();
  return {
    records,
    saveDraft: vi.fn(async (draft: GuestDraft) => {
      records.set(draft.id, structuredClone(draft));
    }),
    loadLastDraft: vi.fn(async (): Promise<GuestDraft | null> => {
      const all = [...records.values()];
      // Shallow copy: structuredClone would cross realms and break
      // `instanceof Blob` checks on the restored files.
      return all.length
        ? { ...all[all.length - 1], files: [...all[all.length - 1].files] }
        : null;
    }),
    removeDraft: vi.fn(async (id: string) => {
      records.delete(id);
    }),
    pruneExpiredDrafts: vi.fn(async () => {}),
  };
});

vi.mock("./guest-store.mjs", () => ({
  saveDraft: storeMocks.saveDraft,
  loadDraft: vi.fn(async () => null),
  loadLastDraft: storeMocks.loadLastDraft,
  removeDraft: storeMocks.removeDraft,
  pruneExpiredDrafts: storeMocks.pruneExpiredDrafts,
}));

type Home = ReturnType<typeof mountGuestHome>;

function mount(
  options: Parameters<typeof mountGuestHome>[1] = {},
): { root: HTMLElement; home: Home; continued: Array<{ draft: GuestDraft | null; path: string }> } {
  const root = document.createElement("div");
  root.innerHTML = renderShell("/adscale-guest", undefined, {
    attachmentsEnabled: options.attachmentsEnabled,
  });
  document.body.appendChild(root);
  const continued: Array<{ draft: GuestDraft | null; path: string }> = [];
  const home = mountGuestHome(root, {
    preview: false,
    ...options,
    onContinue: async (draft, path) => {
      continued.push({ draft, path });
      await options.onContinue?.(draft, path);
    },
  });
  return { root, home, continued };
}

function textareaOf(root: HTMLElement): HTMLTextAreaElement {
  return root.querySelector("#ag-request") as HTMLTextAreaElement;
}

function click(root: HTMLElement, action: string): void {
  const button = root.querySelector(
    `[data-action="${action}"]`,
  ) as HTMLElement;
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function continueWith(request: string, root: HTMLElement): Promise<void> {
  textareaOf(root).value = request;
  click(root, "continue");
  click(root, "authenticate");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  storeMocks.records.clear();
  vi.clearAllMocks();
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
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => "blob:fake";
    URL.revokeObjectURL = () => {};
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("guest-controller", () => {
  it("renders a single main landmark pointed at by the global skip link", () => {
    const { root, home } = mount();
    const mains = root.querySelectorAll("main");
    expect(mains).toHaveLength(1);
    expect(mains[0].id).toBe("main");
    home.destroy();
    root.remove();
  });

  it("attachments off: no attach button, honest guidance, programmatic select/drop/paste refused", () => {
    const { root, home } = mount({ attachmentsEnabled: false });
    expect(
      root.querySelector('button[name="anexar" i], [data-action="attach"]'),
    ).toBeNull();
    expect(root.querySelector(".ag-file-hint")?.textContent).toContain(
      "no Estúdio",
    );
    const file = new File([new Uint8Array(10)], "ref.png", {
      type: "image/png",
    });
    // Programmatic drop with files.
    const composer = root.querySelector("#ag-composer") as HTMLElement;
    const drop = new Event("drop", { bubbles: true }) as Event & {
      dataTransfer: DataTransfer | null;
    };
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [file] },
    });
    composer.dispatchEvent(drop);
    // Programmatic file-input change.
    const input = root.querySelector("#ag-file-input") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // Programmatic paste with files.
    const paste = new Event("paste", { bubbles: true }) as Event & {
      clipboardData: DataTransfer | null;
    };
    Object.defineProperty(paste, "clipboardData", {
      value: { files: [file] },
    });
    textareaOf(root).dispatchEvent(paste);
    expect(home.getState().files).toHaveLength(0);
    expect(root.querySelector("#ag-toast")?.textContent).toContain(
      "desligadas",
    );
    home.destroy();
    root.remove();
  });

  it("attachments on: drop adds real files", () => {
    const { root, home } = mount({ attachmentsEnabled: true });
    expect(root.querySelector('[data-action="attach"]')).not.toBeNull();
    const file = new File([new Uint8Array(10)], "ref.png", {
      type: "image/png",
    });
    const composer = root.querySelector("#ag-composer") as HTMLElement;
    const drop = new Event("drop", { bubbles: true }) as Event & {
      dataTransfer: DataTransfer | null;
    };
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [file], types: ["Files"] },
    });
    composer.dispatchEvent(drop);
    expect(home.getState().files).toHaveLength(1);
    home.destroy();
    root.remove();
  });

  it("retry without edits reuses UUID and original validity; edits rotate UUID keeping the old snapshot", async () => {
    const { root, home, continued } = mount({ attachmentsEnabled: false });
    await continueWith("Meu pedido", root);
    expect(continued).toHaveLength(1);
    const first = continued[0].draft as GuestDraft;
    await continueWith("Meu pedido", root);
    expect(continued).toHaveLength(2);
    expect((continued[1].draft as GuestDraft).id).toBe(first.id);
    expect((continued[1].draft as GuestDraft).expiresAt).toBe(
      first.expiresAt,
    );
    await continueWith("Meu pedido editado", root);
    expect(continued).toHaveLength(3);
    const rotated = continued[2].draft as GuestDraft;
    expect(rotated.id).not.toBe(first.id);
    expect(storeMocks.records.has(first.id)).toBe(true);
    expect(storeMocks.records.has(rotated.id)).toBe(true);
    home.destroy();
    root.remove();
  });

  it("storage failure does not navigate and preserves the form without false success", async () => {
    storeMocks.saveDraft.mockRejectedValueOnce(new Error("quota exceeded"));
    const { root, home, continued } = mount({ attachmentsEnabled: false });
    await continueWith("Pedido que falha", root);
    expect(continued).toHaveLength(0);
    expect(textareaOf(root).value).toBe("Pedido que falha");
    const alert = root.querySelector("#ag-dialog-error") as HTMLElement;
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toContain("continuam nesta tela");
    home.destroy();
    root.remove();
  });

  it("storage failure offers an explicit copy option", async () => {
    storeMocks.saveDraft.mockRejectedValueOnce(new Error("quota exceeded"));
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { root, home, continued } = mount({ attachmentsEnabled: false });
    await continueWith("Pedido copiável", root);
    expect(continued).toHaveLength(0);
    const copyButton = root.querySelector(
      "#ag-dialog-copy",
    ) as HTMLButtonElement;
    expect(copyButton?.textContent).toBe("Copiar pedido");
    copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(writeText).toHaveBeenCalledWith("Pedido copiável");
    expect(root.querySelector("#ag-toast")?.textContent).toContain("copiado");
    home.destroy();
    root.remove();
  });

  it("restoring a legacy draft with files preserves them with a warning", async () => {
    const file = new File([new Uint8Array(10)], "antiga.png", {
      type: "image/png",
    });
    storeMocks.records.set("b216280c-2a0c-43dd-8eae-032203bf99cc", {
      version: 1,
      id: "b216280c-2a0c-43dd-8eae-032203bf99cc",
      request: "Pedido antigo",
      intent: "single",
      exampleId: null,
      files: [file],
      createdAt: Date.now() - 1000,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    });
    const { root, home } = mount({ attachmentsEnabled: false });
    await home.ready;
    expect(root.querySelector("#ag-resume-banner")?.hidden).toBe(false);
    click(root, "restore");
    expect(textareaOf(root).value).toBe("Pedido antigo");
    expect(home.getState().files).toHaveLength(1);
    expect(root.querySelector("#ag-toast")?.textContent).toContain(
      "mantidas",
    );
    home.destroy();
    root.remove();
  });

  it("double authenticate clicks save once", async () => {
    const { root, home, continued } = mount({ attachmentsEnabled: false });
    textareaOf(root).value = "Clique duplo";
    click(root, "continue");
    click(root, "authenticate");
    click(root, "authenticate");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(storeMocks.saveDraft).toHaveBeenCalledTimes(1);
    expect(continued).toHaveLength(1);
    home.destroy();
    root.remove();
  });

  it("renders visitor markup as literal text, never executed", async () => {
    const { root, home } = mount({ attachmentsEnabled: false });
    textareaOf(root).value = "<img src=x onerror=alert(1)>";
    click(root, "continue");
    const dialog = root.querySelector("#ag-dialog") as HTMLElement;
    expect(dialog.querySelector("img")).toBeNull();
    expect(dialog.querySelector(".ag-summary p")?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
    home.destroy();
    root.remove();
  });

  it("empty request takes the example; existing text asks for confirmation", () => {
    const { root, home } = mount({ attachmentsEnabled: false });
    // Empty composer: open the first example, use it → prompt fills the form.
    click(root, "gallery");
    const exampleButton = root.querySelector(
      '[data-action="example"]',
    ) as HTMLElement;
    const exampleId = exampleButton.dataset.example as string;
    exampleButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const useButton = root.querySelector(
      `[data-action="use-example"][data-example="${exampleId}"]`,
    ) as HTMLElement;
    useButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(textareaOf(root).value.length).toBeGreaterThan(0);
    expect(home.getState().exampleId).toBe(exampleId);
    // Existing text: choosing another example asks before replacing.
    textareaOf(root).value = "meu texto";
    click(root, "gallery");
    const otherButton = [
      ...root.querySelectorAll('[data-action="example"]'),
    ].find(
      (el) => (el as HTMLElement).dataset.example !== exampleId,
    ) as HTMLElement;
    const otherId = otherButton.dataset.example as string;
    otherButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const otherUse = root.querySelector(
      `[data-action="use-example"][data-example="${otherId}"]`,
    ) as HTMLElement;
    otherUse.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const dialogTitle = root.querySelector(
      "#ag-dialog-title",
    ) as HTMLElement;
    expect(dialogTitle.textContent).toContain("Trocar o texto");
    expect(textareaOf(root).value).toBe("meu texto");
    click(root, "confirm-example");
    expect(textareaOf(root).value).not.toBe("meu texto");
    expect(home.getState().exampleId).toBe(otherId);
    home.destroy();
    root.remove();
  });

  it("mount → unmount → mount leaves no stray listeners or dialogs", () => {
    const first = mount({ attachmentsEnabled: false });
    first.home.destroy();
    first.root.remove();
    const second = mount({ attachmentsEnabled: false });
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
      }),
    );
    const dialogs = document.querySelectorAll("#ag-dialog");
    expect(dialogs).toHaveLength(1);
    second.home.destroy();
    second.root.remove();
  });
});

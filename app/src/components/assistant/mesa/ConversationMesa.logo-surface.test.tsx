// The logo card's plate in the conversation's mesa (ticket 16): from the handoff's item while it is open, from the logo asset's metadata in the Library.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";
import type { HandoffState } from "@/server/equipe/domain/handoff";

vi.mock("@/lib/hooks/use-media-query", () => ({ useIsMobile: () => false }));
let accountState: { data?: { handoff?: HandoffState | null }; isSuccess: boolean } = { isSuccess: false };
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: () => accountState }));
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({ useCreativeInspirations: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/use-client-profiles", () => ({ useClientProfiles: () => ({ data: [{ id: "profile-1", logoAssetKey: "logo-key", brandColors: ["#111111"] }] }) }));
type Asset = { id: string; key: string; source?: string; metadata?: Record<string, unknown> | null };
let identityAssets: Asset[] = [];
vi.mock("@/lib/hooks/use-workspace-assets", () => ({
  useWorkspaceAssets: (options: { kind?: string; enabled?: boolean }) => ({ data: options.enabled ? { assets: options.kind === "identity" ? identityAssets : [] } : undefined }),
}));

import ConversationMesa from "./ConversationMesa";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const handoff = (patch: Partial<HandoffState>): HandoffState => ({ step: "source", version: 1, source: null, readingId: null, readsUsed: 0, reading: {}, captured: {}, decisions: {}, ...patch });
const messages = [{ type: "assistant", payload: { handoffStep: "intro" } }, { type: "user", payload: { text: "https://site.com" } }];
function renderMesa() {
  return render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><ConversationMesa accountId="acc-1" clientProfileId="profile-1" messages={messages} /></NextIntlClientProvider>);
}
const plate = () => screen.getByRole("img", { name: "Logo da marca" }).parentElement as HTMLElement;

beforeEach(() => { identityAssets = []; });

describe("ConversationMesa: the Library phase", () => {
  beforeEach(() => { accountState = { isSuccess: true, data: { handoff: handoff({ step: "done" }) } }; });

  it("a logo asset measured dark paints the dark plate", () => {
    identityAssets = [{ id: "logo-asset", key: "logo-key", metadata: { surface: "dark", provisional: false } }];
    renderMesa();
    expect(plate()).toHaveAttribute("data-surface", "dark");
    expect(screen.getByRole("img", { name: "Logo da marca" })).toHaveAttribute("src", "/api/workspace/assets/logo-asset/file");
  });
  it("a logo asset measured light, or never measured, keeps the cream plate", () => {
    for (const metadata of [{ surface: "light" }, {}, null, undefined]) {
      identityAssets = [{ id: "logo-asset", key: "logo-key", metadata }];
      const { unmount } = renderMesa();
      expect(plate(), JSON.stringify(metadata)).toHaveAttribute("data-surface", "light");
      unmount();
    }
  });
  it.each([["purple"], ["DARK"], [""], [null], [1], [{ surface: "dark" }]] as unknown[][])("a surface that is not one (%j) is the cream plate, never a crash", surface => {
    identityAssets = [{ id: "logo-asset", key: "logo-key", metadata: { surface } }];
    renderMesa();
    expect(plate()).toHaveAttribute("data-surface", "light");
  });
  it("only the brand's own logo asset decides: another identity asset that is dark does not", () => {
    identityAssets = [{ id: "other", key: "other-key", metadata: { surface: "dark" } }, { id: "logo-asset", key: "logo-key", metadata: { surface: "light" } }];
    renderMesa();
    expect(plate()).toHaveAttribute("data-surface", "light");
    expect(screen.getByRole("img", { name: "Logo da marca" })).toHaveAttribute("src", "/api/workspace/assets/logo-asset/file");
  });
});

describe("ConversationMesa: while the handoff is open", () => {
  it("the item's surface dark paints the dark plate", () => {
    accountState = { isSuccess: true, data: { handoff: handoff({ step: "identity", captured: { logo: [{ id: uuid(1), value: "https://o.example/1.png", origin: "site", key: "k1", surface: "dark" }] } }) } };
    renderMesa();
    expect(plate()).toHaveAttribute("data-surface", "dark");
  });
  it("an item without a surface paints the cream plate", () => {
    accountState = { isSuccess: true, data: { handoff: handoff({ step: "identity", captured: { logo: [{ id: uuid(1), value: "https://o.example/1.png", origin: "site", key: "k1" }] } }) } };
    renderMesa();
    expect(plate()).toHaveAttribute("data-surface", "light");
  });
  it("the plate comes from the item, not from the Library's asset (which is not read until the handoff is done)", () => {
    identityAssets = [{ id: "logo-asset", key: "logo-key", metadata: { surface: "dark" } }];
    accountState = { isSuccess: true, data: { handoff: handoff({ step: "identity", captured: { logo: [{ id: uuid(1), value: "https://o.example/1.png", origin: "site", key: "k1", surface: "light" }] } }) } };
    renderMesa();
    expect(plate()).toHaveAttribute("data-surface", "light");
  });
});

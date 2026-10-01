import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";
import type { HandoffState } from "@/server/equipe/domain/handoff";

vi.mock("@/lib/hooks/use-media-query", () => ({ useIsMobile: () => false }));
let accountState: { data?: { handoff?: HandoffState | null }; isSuccess: boolean } = { isSuccess: false };
const stateHook = vi.fn((id: string | null) => { void id; return accountState; });
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: (id: string | null) => stateHook(id) }));
const inspirationsHook = vi.fn((id: string | null) => { void id; return { data: inspirationData }; });
let inspirationData: Array<{ id: string; title: string; previewUrl: string | null }> = [];
vi.mock("@/lib/hooks/use-creative-inspirations", () => ({ useCreativeInspirations: (id: string | null) => inspirationsHook(id) }));
let profiles: Array<{ id: string; logoAssetKey?: string | null; brandColors?: string[] }> = [];
vi.mock("@/lib/hooks/use-client-profiles", () => ({ useClientProfiles: () => ({ data: profiles }) }));
type Asset = { id: string; key: string; source?: string; metadata?: { provisional?: boolean } };
let assetsByKind: Partial<Record<string, Asset[]>> = {};
const assetsHook = vi.fn((options: { kind?: string; enabled?: boolean }) => ({ data: options.enabled ? { assets: assetsByKind[options.kind ?? ""] ?? [] } : undefined }));
vi.mock("@/lib/hooks/use-workspace-assets", () => ({ useWorkspaceAssets: (options: { kind?: string; enabled?: boolean }) => assetsHook(options) }));

import ConversationMesa from "./ConversationMesa";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const handoff = (patch: Partial<HandoffState>): HandoffState => ({
  step: "source", version: 1, source: null, readingId: null, readsUsed: 0, reading: {}, captured: {}, decisions: {}, ...patch,
});
const managed = (n: number, origin: "site" | "instagram" | "user") => ({ id: uuid(n), value: `https://origin.example/${n}.jpg`, origin, key: `k${n}` });

const opening = [
  { type: "assistant", payload: { handoffStep: "intro" } },
  { type: "equipe_card", payload: { kind: "handoff", step: "source" } },
];

function renderMesa(messages: Array<{ type: string; payload: Record<string, unknown> }> = opening) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <ConversationMesa accountId="acc-1" clientProfileId="profile-1" messages={messages} />
    </NextIntlClientProvider>,
  );
}

describe("ConversationMesa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountState = { isSuccess: true, data: { handoff: handoff({}) } };
    inspirationData = [1, 2, 3].map((n) => ({ id: `i${n}`, title: `Inspiração ${n}`, previewUrl: `/i${n}.jpg` }));
    profiles = [{ id: "profile-1", logoAssetKey: "logo-key", brandColors: ["#111111", "#222222"] }];
    assetsByKind = {};
  });

  it("renders nothing while the account state has not loaded", () => {
    accountState = { isSuccess: false };
    const { container } = renderMesa();
    expect(container).toBeEmptyDOMElement();
    expect(inspirationsHook).toHaveBeenCalledWith(null);
  });

  it("renders nothing when there is no data to show", () => {
    inspirationData = [];
    const { container } = renderMesa();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the curated inspirations, large, on the first open", () => {
    renderMesa();
    expect(screen.getByTestId("mesa")).toHaveAttribute("data-size", "large");
    expect(screen.getAllByTestId("mesa-card-inspiration")).toHaveLength(3);
    expect(inspirationsHook).toHaveBeenCalledWith("profile-1");
  });

  it("goes compact once anything else is in the conversation", () => {
    renderMesa([...opening, { type: "user", payload: { text: "https://site.com" } }]);
    expect(screen.getByTestId("mesa")).toHaveAttribute("data-size", "compact");
  });

  it("builds the brand from the handoff state, with photos only from our managed copy", () => {
    accountState = {
      isSuccess: true,
      data: {
        handoff: handoff({
          step: "reading",
          captured: { images: [managed(1, "site"), { id: uuid(2), value: "https://origin.example/2.jpg", origin: "site" }] },
        }),
      },
    };
    renderMesa([...opening, { type: "user", payload: {} }]);
    const photos = screen.getAllByTestId("mesa-card-photo");
    expect(photos).toHaveLength(1);
    expect(photos[0].querySelector("img")).toHaveAttribute("src", `/api/workspace/assets/${uuid(1)}/file`);
    expect(document.body.innerHTML).not.toContain("origin.example");
    expect(inspirationsHook).toHaveBeenCalledWith(null);
  });

  it("hides Instagram posts until the profile is confirmed, and shows them after", () => {
    const captured = { images: [managed(1, "site"), managed(2, "instagram")] };
    accountState = { isSuccess: true, data: { handoff: handoff({ step: "images", captured }) } };
    const { unmount } = renderMesa([...opening, { type: "user", payload: {} }]);
    expect(screen.getAllByTestId("mesa-card-photo")).toHaveLength(1);
    unmount();
    accountState = {
      isSuccess: true,
      data: { handoff: handoff({ step: "images", captured, decisions: { networks: [{ id: "n", value: "@a", origin: "site", platform: "instagram" }] } }) },
    };
    renderMesa([...opening, { type: "user", payload: {} }]);
    expect(screen.getAllByTestId("mesa-card-photo")).toHaveLength(2);
  });

  it("shows queued cards while the images are still being read", () => {
    accountState = {
      isSuccess: true,
      data: { handoff: handoff({ step: "reading", reading: { images: { runId: "r", taskIntentId: "t", status: "running" } } }) },
    };
    renderMesa([...opening, { type: "user", payload: {} }]);
    expect(screen.getAllByTestId("mesa-card-queued")).toHaveLength(3);
  });

  describe("library phase (handoff done)", () => {
    beforeEach(() => {
      accountState = { isSuccess: true, data: { handoff: handoff({ step: "done" }) } };
      assetsByKind = {
        identity: [{ id: "logo-asset", key: "logo-key" }, { id: "other-logo", key: "other" }],
        images: [{ id: "img-site", key: "a", source: "brand_site" }, { id: "img-prov", key: "b", source: "brand_site", metadata: { provisional: true } }],
        post: [{ id: "post-ig", key: "c", source: "brand_instagram" }],
      };
    });

    it("is always compact, even for a conversation that looks like its opening", () => {
      renderMesa();
      expect(screen.getByTestId("mesa")).toHaveAttribute("data-size", "compact");
    });

    it("shows the brand logo, the palette and the photos from the Library, never a provisional one", () => {
      renderMesa();
      expect(screen.getByRole("img", { name: "Logo da marca" })).toHaveAttribute("src", "/api/workspace/assets/logo-asset/file");
      expect(screen.getByTestId("mesa-card-palette")).toHaveTextContent("Paleta · 2 cores");
      const sources = screen.getAllByTestId("mesa-card-photo").map((item) => item.querySelector("img")?.getAttribute("src"));
      expect(sources).toEqual(["/api/workspace/assets/img-site/file", "/api/workspace/assets/post-ig/file"]);
      expect(screen.getAllByTestId("mesa-card-photo").map((item) => item.textContent)).toEqual(["Do site", "Do Instagram"]);
    });

    it("asks the Library only once the handoff is done, and never for curated inspirations", () => {
      accountState = { isSuccess: true, data: { handoff: handoff({}) } };
      renderMesa();
      expect(assetsHook.mock.calls.every(([options]) => options.enabled === false)).toBe(true);
      vi.clearAllMocks();
      accountState = { isSuccess: true, data: { handoff: handoff({ step: "done" }) } };
      renderMesa();
      expect(assetsHook.mock.calls.some(([options]) => options.enabled === true)).toBe(true);
      expect(inspirationsHook).toHaveBeenCalledWith(null);
      expect(assetsHook.mock.calls.find(([options]) => options.kind === "images")?.[0]).toMatchObject({ excludeSources: ["curated_inspiration", "curated_inspiration_copy"] });
    });

    it("leaves the logo out when the brand's logo key is not among the identity assets", () => {
      profiles = [{ id: "profile-1", logoAssetKey: "missing", brandColors: [] }];
      renderMesa();
      expect(screen.queryByTestId("mesa-card-logo")).not.toBeInTheDocument();
      expect(screen.queryByTestId("mesa-card-palette")).not.toBeInTheDocument();
    });

    it("renders nothing for an empty Library", () => {
      assetsByKind = {};
      profiles = [{ id: "profile-1" }];
      const { container } = renderMesa();
      expect(container).toBeEmptyDOMElement();
    });
  });
});

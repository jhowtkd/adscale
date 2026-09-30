import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FromZeroReferencesPanel from "./FromZeroReferencesPanel";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const activeClientProfileId = vi.hoisted(() => ({ current: null as string | null }));
vi.mock("@/lib/store", () => ({
  useAppStore: { getState: () => ({ activeClientProfileId: activeClientProfileId.current }) },
}));

vi.mock("@/lib/hooks/use-guided-flow-commands", () => ({
  useGuidedFlowCommand: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/lib/hooks/use-workspace-assets", () => ({
  useWorkspaceAssets: () => ({
    data: {
      assets: [
        { id: "asset-1", name: "referencia-1.png", url: "/api/workspace/assets/asset-1/file" },
      ],
      total: 1,
    },
    isLoading: false,
  }),
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientReferences: () => ({
    data: [
      { id: "ref-1", label: "cliente-ref.jpg", url: "/api/workspace/assets/ref-asset/file" },
    ],
  }),
}));

const guidedFlow: GuidedFlow = {
  id: "flow-1",
  workspaceId: "ws-1",
  clientProfileId: "cp-1",
  threadId: "thread-1",
  path: "from_zero",
  status: "active",
  currentStep: "collect_references",
  slots: {},
  missingFields: [],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderPanel(overrides: { threadId?: string; clientProfileId?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FromZeroReferencesPanel
        threadId={overrides.threadId ?? "thread-1"}
        clientProfileId={overrides.clientProfileId ?? "cp-1"}
        guidedFlow={guidedFlow}
      />
    </QueryClientProvider>,
  );
}

describe("FromZeroReferencesPanel thumbnails", () => {
  it("renders reference thumbnails unoptimized with the raw file URL", () => {
    renderPanel();
    for (const [name, url] of [
      ["cliente-ref.jpg", "/api/workspace/assets/ref-asset/file"],
      ["referencia-1.png", "/api/workspace/assets/asset-1/file"],
    ]) {
      const img = screen.getByRole("img", { name });
      // Authenticated file route: the browser must fetch it with the user
      // cookie, so the src must stay raw — never /_next/image?... (401).
      expect(img).toHaveAttribute("src", url);
      expect(img.getAttribute("src")).not.toContain("/_next/image");
    }
  });
});

describe("FromZeroReferencesPanel upload scope (PR 610 review R1)", () => {
  it("uploads a thread B reference to B, even while the global brand selector remains A", async () => {
    activeClientProfileId.current = "brand-A";
    const request = vi.fn().mockResolvedValue(Response.json({
      asset: { id: "asset", key: "managed/image.png", url: "/image.png", type: "image/png", name: "image.png", size: 8 },
    }));
    vi.stubGlobal("fetch", request);
    try {
      const { container } = renderPanel({ threadId: "thread-B", clientProfileId: "brand-B" });
      const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "image.png", { type: "image/png" });
      const input = container.querySelector('input[type="file"]');
      fireEvent.change(input!, { target: { files: [file] } });

      await waitFor(() => expect(request).toHaveBeenCalled());

      const form = request.mock.calls[0]![1].body as FormData;
      // The thread's OWN brand must travel with the upload — never the
      // unrelated global selector, which would put thread B's reference in
      // brand A's Library instead.
      expect(form.get("clientProfileId")).toBe("brand-B");
    } finally {
      vi.unstubAllGlobals();
      activeClientProfileId.current = null;
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FromZeroReferencesPanel from "./FromZeroReferencesPanel";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
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

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FromZeroReferencesPanel
        threadId="thread-1"
        clientProfileId="cp-1"
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

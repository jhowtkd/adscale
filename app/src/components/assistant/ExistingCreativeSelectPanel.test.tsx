import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ExistingCreativeSelectPanel from "./ExistingCreativeSelectPanel";
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
        { id: "asset-1", name: "criativo-1.png", url: "/api/workspace/assets/asset-1/file" },
        { id: "asset-2", name: "criativo-2.jpg", url: "/api/workspace/assets/asset-2/file" },
      ],
      total: 2,
    },
    isLoading: false,
  }),
}));

const guidedFlow: GuidedFlow = {
  id: "flow-1",
  workspaceId: "ws-1",
  clientProfileId: "cp-1",
  threadId: "thread-1",
  path: "existing_creative",
  status: "active",
  currentStep: "select_creative",
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
      <ExistingCreativeSelectPanel threadId="thread-1" guidedFlow={guidedFlow} />
    </QueryClientProvider>,
  );
}

describe("ExistingCreativeSelectPanel thumbnails", () => {
  it("renders asset thumbnails unoptimized with the raw file URL", () => {
    renderPanel();
    for (const [name, url] of [
      ["criativo-1.png", "/api/workspace/assets/asset-1/file"],
      ["criativo-2.jpg", "/api/workspace/assets/asset-2/file"],
    ]) {
      const img = screen.getByRole("img", { name });
      // Authenticated file route: the browser must fetch it with the user
      // cookie, so the src must stay raw — never /_next/image?... (401).
      expect(img).toHaveAttribute("src", url);
      expect(img.getAttribute("src")).not.toContain("/_next/image");
    }
  });
});

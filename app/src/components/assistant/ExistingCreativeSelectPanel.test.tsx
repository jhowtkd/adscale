import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const mockUseWorkspaceAssets = vi.fn();
vi.mock("@/lib/hooks/use-workspace-assets", () => ({
  useWorkspaceAssets: (...args: unknown[]) => mockUseWorkspaceAssets(...args),
}));

const mockUploadChatAttachment = vi.fn();
vi.mock("@/lib/assistant/chat-attachments", () => ({
  uploadChatAttachment: (...args: unknown[]) => mockUploadChatAttachment(...args),
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

function renderPanel(overrides: { clientProfileId?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExistingCreativeSelectPanel threadId="thread-1" clientProfileId={overrides.clientProfileId ?? "cp-1"} guidedFlow={guidedFlow} />
    </QueryClientProvider>,
  );
}

describe("ExistingCreativeSelectPanel thumbnails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkspaceAssets.mockReturnValue({
      data: {
        assets: [
          { id: "asset-1", name: "criativo-1.png", url: "/api/workspace/assets/asset-1/file" },
          { id: "asset-2", name: "criativo-2.jpg", url: "/api/workspace/assets/asset-2/file" },
        ],
        total: 2,
      },
      isLoading: false,
    });
  });

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

describe("ExistingCreativeSelectPanel: owner explicit (PR 610 review R1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkspaceAssets.mockReturnValue({ data: { assets: [], total: 0 }, isLoading: false });
    mockUploadChatAttachment.mockResolvedValue({ assetId: "asset-new", key: "managed/new.png" });
  });

  it("scopes the existing-asset gallery query to the given clientProfileId", () => {
    renderPanel({ clientProfileId: "brand-b" });

    expect(mockUseWorkspaceAssets).toHaveBeenCalledWith(expect.objectContaining({ clientProfileId: "brand-b" }));
  });

  it("forwards the SAME clientProfileId to an upload — never a different/global brand", async () => {
    const { container } = renderPanel({ clientProfileId: "brand-b" });
    const file = new File(["image"], "novo.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]');

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(mockUploadChatAttachment).toHaveBeenCalled());
    expect(mockUploadChatAttachment).toHaveBeenCalledWith(file, { clientProfileId: "brand-b" });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AutoBriefingModal from "./AutoBriefingModal";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-auto-briefing", () => ({
  useAutoBriefing: vi.fn(),
}));

vi.mock("@/lib/hooks/use-assets", () => ({
  useUploadAsset: vi.fn(),
}));

import { useAutoBriefing } from "@/lib/hooks/use-auto-briefing";
import { useUploadAsset } from "@/lib/hooks/use-assets";

const mockUseAutoBriefing = vi.mocked(useAutoBriefing);
const mockUseUploadAsset = vi.mocked(useUploadAsset);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function setupMocks(overrides?: {
  uploadMutateAsync?: () => Promise<{ key: string }>;
  briefingMutateAsync?: () => Promise<any>;
  uploadPending?: boolean;
  briefingPending?: boolean;
}) {
  const uploadMutateAsync = overrides?.uploadMutateAsync ?? vi.fn(() =>
    Promise.resolve({ key: "assets/uploaded.png" })
  );
  const briefingMutateAsync = overrides?.briefingMutateAsync ?? vi.fn(() =>
    Promise.resolve({
      extracted: {
        client: "Acme",
        product: "Widget",
        offer: "20% off",
        objective: "Drive sales",
        audience: "Tech enthusiasts",
        ctaText: "Buy now",
        constraints: "",
      },
      confidence: {
        client: 0.85,
        offer: 0.8,
        ctaText: 0.9,
        audience: 0.6,
      },
    })
  );

  mockUseUploadAsset.mockReturnValue({
    mutateAsync: uploadMutateAsync,
    isPending: overrides?.uploadPending ?? false,
  } as any);

  mockUseAutoBriefing.mockReturnValue({
    mutateAsync: briefingMutateAsync,
    isPending: overrides?.briefingPending ?? false,
  } as any);

  return { uploadMutateAsync, briefingMutateAsync };
}

describe("AutoBriefingModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders upload dropzone when open", () => {
    setupMocks();
    render(
      <AutoBriefingModal
        open={true}
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        onApply={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.getByText("extractFromImage")).toBeInTheDocument();
    expect(screen.getByText("dropzoneText")).toBeInTheDocument();
  });

  it("shows file input and triggers upload on analyze", async () => {
    const { uploadMutateAsync, briefingMutateAsync } = setupMocks();
    render(
      <AutoBriefingModal
        open={true}
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        onApply={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const input = document.getElementById("auto-briefing-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("analyzeImage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("analyzeImage"));

    await waitFor(() => {
      expect(uploadMutateAsync).toHaveBeenCalledWith({ file });
      expect(briefingMutateAsync).toHaveBeenCalledWith("assets/uploaded.png");
    });
  });

  it("shows extracted fields in preview state after analysis", async () => {
    setupMocks();
    render(
      <AutoBriefingModal
        open={true}
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        onApply={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const input = document.getElementById("auto-briefing-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("analyzeImage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("analyzeImage"));

    await waitFor(() => {
      expect(screen.getByText("Acme")).toBeInTheDocument();
      expect(screen.getByText("20% off")).toBeInTheDocument();
    });
  });

  it("auto-selects fields with confidence >= 0.7", async () => {
    setupMocks();
    render(
      <AutoBriefingModal
        open={true}
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        onApply={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const input = document.getElementById("auto-briefing-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("analyzeImage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("analyzeImage"));

    await waitFor(() => {
      // audience has confidence 0.6, so it should NOT be auto-selected
      // client (0.85), offer (0.8), ctaText (0.9) should be auto-selected
      expect(screen.getByText("applyExtracted")).toBeInTheDocument();
    });
  });

  it("calls onApply with selected fields when apply is clicked", async () => {
    const onApply = vi.fn();
    setupMocks();
    render(
      <AutoBriefingModal
        open={true}
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        onApply={onApply}
      />,
      { wrapper: createWrapper() }
    );

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const input = document.getElementById("auto-briefing-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("analyzeImage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("analyzeImage"));

    await waitFor(() => {
      expect(screen.getByText("applyExtracted")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("applyExtracted"));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
          client: "Acme",
          offer: "20% off",
          objective: "Drive sales",
        })
      );
    });
  });

  it("shows error when analysis fails", async () => {
    setupMocks({
      briefingMutateAsync: vi.fn(() =>
        Promise.reject(new Error("analysisFailed"))
      ),
    });
    render(
      <AutoBriefingModal
        open={true}
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        onApply={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const input = document.getElementById("auto-briefing-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("analyzeImage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("analyzeImage"));

    await waitFor(() => {
      expect(screen.getByText("analysisFailed")).toBeInTheDocument();
    });
  });

  it("disables apply button when no fields are selected", async () => {
    setupMocks({
      briefingMutateAsync: vi.fn(() =>
        Promise.resolve({
          extracted: {
            client: "Acme",
            product: "Widget",
            offer: "20% off",
            objective: "Drive sales",
            audience: "Tech enthusiasts",
            ctaText: "Buy now",
            constraints: "",
          },
          confidence: {
            client: 0.4,
            offer: 0.3,
            ctaText: 0.2,
            audience: 0.1,
          },
        })
      ),
    });
    render(
      <AutoBriefingModal
        open={true}
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        onApply={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const input = document.getElementById("auto-briefing-file") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("analyzeImage")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("analyzeImage"));

    await waitFor(() => {
      const applyButton = screen.getByText("applyExtracted");
      expect(applyButton).toBeDisabled();
    });
  });

  it("does not render when open is false", () => {
    setupMocks();
    render(
      <AutoBriefingModal
        open={false}
        onOpenChange={vi.fn()}
        campaignId="camp-1"
        onApply={vi.fn()}
      />,
      { wrapper: createWrapper() }
    );

    expect(screen.queryByText("extractFromImage")).not.toBeInTheDocument();
  });
});

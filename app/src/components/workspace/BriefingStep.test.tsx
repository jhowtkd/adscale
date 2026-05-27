import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BriefingStep from "./BriefingStep";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = ((key: string) => key) as unknown as { raw: (key: string) => unknown };
    t.raw = (key: string) => {
      if (key === "objectives") return { awareness: "Awareness", conversion: "Conversion" };
      if (key === "tones") return { professional: "Professional", casual: "Casual" };
      if (key === "platformNames") return { Meta: "Meta Ads", TikTok: "TikTok Ads", Google: "Google Ads" };
      return {};
    };
    return t;
  },
}));

vi.mock("@/lib/hooks/use-creative-diagnosis", () => ({
  useGenerateCreativeDiagnosis: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCreativeDiagnosis: () => ({ mutate: vi.fn(), isPending: false }),
  useRegenerateCreativeDiagnosis: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: vi.fn(),
  useCreateClientProfile: vi.fn(),
  useClientProfileMemory: vi.fn(),
  useClientReferences: vi.fn(),
}));

vi.mock("@/lib/hooks/use-brand-kit", () => ({
  useBrandKit: () => ({ data: null }),
}));

vi.mock("@/lib/hooks/use-assets", () => ({
  useCampaignAssets: () => ({ data: [] }),
  useUploadAsset: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-auto-briefing", () => ({
  useAutoBriefing: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import {
  useClientProfiles,
  useCreateClientProfile,
  useClientProfileMemory,
  useClientReferences,
} from "@/lib/hooks/use-client-profiles";

const mockUseClientProfiles = vi.mocked(useClientProfiles);
const mockUseCreateClientProfile = vi.mocked(useCreateClientProfile);
const mockUseClientProfileMemory = vi.mocked(useClientProfileMemory);
const mockUseClientReferences = vi.mocked(useClientReferences);

// Provide QueryClient for TanStack Query hooks
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("BriefingStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClientProfiles.mockReturnValue({
      data: [
        { id: "profile-1", name: "Acme" },
        { id: "profile-2", name: "Beta" },
      ],
      isPending: false,
      error: null,
    } as ReturnType<typeof useClientProfiles>);
    mockUseClientReferences.mockReturnValue({
      data: [
        { id: "ref-1", label: "Hero", kind: "style", notes: null },
        { id: "ref-2", label: "Logo", kind: "logo", notes: null },
      ],
      isPending: false,
      error: null,
    } as ReturnType<typeof useClientReferences>);
    mockUseClientProfileMemory.mockReturnValue({
      data: { enabled: true, items: [] },
      isLoading: false,
      isPending: false,
      error: null,
    } as ReturnType<typeof useClientProfileMemory>);
    mockUseCreateClientProfile.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useCreateClientProfile>);
  });

  it("renders selected client profile from campaign", () => {
    render(
      <BriefingStep
        campaign={{
          id: "cmp-1",
          name: "Test",
          client: "Acme",
          platforms: ["Meta"],
          status: "draft",
          variations: 0,
          creditsUsed: 0,
          lastModified: new Date(),
          createdAt: new Date(),
          clientProfileId: "profile-1",
          selectedReferenceIds: ["ref-1"],
        }}
        onContinue={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("Logo")).toBeInTheDocument();
  });

  it("selecting a client shows references", () => {
    render(
      <BriefingStep
        campaign={{
          id: "cmp-1",
          name: "Test",
          client: "Acme",
          platforms: ["Meta"],
          status: "draft",
          variations: 0,
          creditsUsed: 0,
          lastModified: new Date(),
          createdAt: new Date(),
          clientProfileId: "profile-1",
        }}
        onContinue={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("Logo")).toBeInTheDocument();
  });

  it("shows learned brand memory when available", () => {
    mockUseClientProfileMemory.mockReturnValue({
      data: {
        enabled: true,
        items: [{ text: "Acme favors direct CTAs.", source: "fact" }],
      },
      isLoading: false,
      isPending: false,
      error: null,
    } as ReturnType<typeof useClientProfileMemory>);

    render(
      <BriefingStep
        campaign={{
          id: "cmp-1",
          name: "Test",
          client: "Acme",
          platforms: ["Meta"],
          status: "draft",
          variations: 0,
          creditsUsed: 0,
          lastModified: new Date(),
          createdAt: new Date(),
          clientProfileId: "profile-1",
        }}
        onContinue={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText("brandMemoryTitle")).toBeInTheDocument();
    expect(screen.getByText("Acme favors direct CTAs.")).toBeInTheDocument();
  });

  it("checking references updates selectedReferenceIds", () => {
    render(
      <BriefingStep
        campaign={{
          id: "cmp-1",
          name: "Test",
          client: "Acme",
          platforms: ["Meta"],
          status: "draft",
          variations: 0,
          creditsUsed: 0,
          lastModified: new Date(),
          createdAt: new Date(),
          clientProfileId: "profile-1",
        }}
        onContinue={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    const heroBtn = screen.getByRole("button", { name: /Hero/i });
    fireEvent.click(heroBtn);

    expect(heroBtn.className).toContain("border-[var(--accent-mint)]");
  });

  it("creating a new client profile from briefing adds it to selection", async () => {
    const mutate = vi.fn((_data, { onSuccess }) => {
      onSuccess({ id: "new-profile", name: "Gamma" });
    });
    mockUseCreateClientProfile.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateClientProfile>);

    render(
      <BriefingStep
        campaign={{
          id: "cmp-1",
          name: "Test",
          client: "Acme",
          platforms: ["Meta"],
          status: "draft",
          variations: 0,
          creditsUsed: 0,
          lastModified: new Date(),
          createdAt: new Date(),
        }}
        onContinue={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByText("createClientProfile"));
    const nameInput = screen.getByPlaceholderText("newProfileNamePlaceholder");
    fireEvent.change(nameInput, { target: { value: "Gamma" } });
    fireEvent.click(screen.getByText("saveProfile"));

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Gamma" }),
        expect.anything()
      );
    });
  });

  it("opens auto-briefing modal when extract button is clicked", async () => {
    render(
      <BriefingStep
        campaign={{
          id: "cmp-1",
          name: "Test",
          client: "Acme",
          platforms: ["Meta"],
          status: "draft",
          variations: 0,
          creditsUsed: 0,
          lastModified: new Date(),
          createdAt: new Date(),
        }}
        onContinue={vi.fn()}
        onSaveDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    fireEvent.click(screen.getByText("extractFromImage"));
    expect(await screen.findByText("dropzoneText")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BriefingStep from "./BriefingStep";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    (t as unknown as { raw: (key: string) => Record<string, string> }).raw = (key: string) => {
      if (key === "objectives") return { awareness: "Awareness", conversion: "Conversion" };
      if (key === "tones") return { professional: "Professional", casual: "Casual" };
      if (key === "platformNames") return { Meta: "Meta Ads", TikTok: "TikTok Ads", Google: "Google Ads" };
      return {};
    };
    return t;
  },
}));

vi.mock("@/lib/hooks/use-briefing-doctor", () => ({
  useBriefingDoctorAnalysis: () => ({
    mutate: vi.fn(),
    data: null,
    isPending: false,
    isError: false,
  }),
}));

vi.mock("@/lib/hooks/use-creative-diagnosis", () => ({
  useGenerateCreativeDiagnosis: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateCreativeDiagnosis: () => ({ mutate: vi.fn(), isPending: false }),
  useRegenerateCreativeDiagnosis: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: vi.fn(),
  useCreateClientProfile: vi.fn(),
  useClientReferences: vi.fn(),
}));

import {
  useClientProfiles,
  useCreateClientProfile,
  useClientReferences,
} from "@/lib/hooks/use-client-profiles";

const mockUseClientProfiles = vi.mocked(useClientProfiles);
const mockUseCreateClientProfile = vi.mocked(useCreateClientProfile);
const mockUseClientReferences = vi.mocked(useClientReferences);

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
      />
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
      />
    );

    expect(screen.getByText("Hero")).toBeInTheDocument();
    expect(screen.getByText("Logo")).toBeInTheDocument();
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
      />
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
      />
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
});

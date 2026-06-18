import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import PilotSidebar from "./PilotSidebar";

const {
  addToast,
  createProfileMutate,
  updateCampaignMutate,
  useCampaignAssetsMock,
  useClientProfilesMock,
} = vi.hoisted(() => ({
  addToast: vi.fn(),
  createProfileMutate: vi.fn(),
  updateCampaignMutate: vi.fn(),
  useCampaignAssetsMock: vi.fn(),
  useClientProfilesMock: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <img alt={props.alt} />,
}));

vi.mock("@/components/layout/Panel", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/workspace/CreativeReadinessPanel", () => ({
  default: () => <div data-testid="readiness-panel" />,
}));

vi.mock("@/lib/hooks/use-assets", () => ({
  useCampaignAssets: () => useCampaignAssetsMock(),
}));

vi.mock("@/lib/hooks/use-campaigns", () => ({
  useUpdateCampaign: () => ({
    isPending: false,
    mutate: updateCampaignMutate,
  }),
}));

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => useClientProfilesMock(),
  useCreateClientProfile: () => ({
    isPending: false,
    mutate: createProfileMutate,
  }),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: (selector: (state: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}));

function renderSidebar(overrides: Partial<ComponentProps<typeof PilotSidebar>> = {}) {
  return render(
    <PilotSidebar
      campaignId="campaign-1"
      campaign={{ name: "Campanha", client: "CENBRAP", clientProfileId: null }}
      briefing={{ objective: "awareness" }}
      {...overrides}
    />
  );
}

describe("PilotSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCampaignAssetsMock.mockReturnValue({ data: [], isLoading: false });
    useClientProfilesMock.mockReturnValue({
      data: [{ id: "profile-1", name: "CENBRAP" }],
      isLoading: false,
    });
    updateCampaignMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.();
    });
    createProfileMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ id: "profile-created", name: "CENBRAP" });
    });
  });

  it("lets the operator link an existing client profile to the campaign", () => {
    renderSidebar();

    fireEvent.change(screen.getByLabelText("Perfil do cliente"), {
      target: { value: "profile-1" },
    });

    expect(updateCampaignMutate).toHaveBeenCalledWith(
      { clientProfileId: "profile-1" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(addToast).toHaveBeenCalledWith(
      "success",
      "Perfil de cliente vinculado à campanha."
    );
  });

  it("creates and links a client profile when no profile exists", () => {
    useClientProfilesMock.mockReturnValue({ data: [], isLoading: false });

    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Criar perfil a partir deste cliente" }));

    expect(createProfileMutate).toHaveBeenCalledWith(
      { name: "CENBRAP" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(updateCampaignMutate).toHaveBeenCalledWith(
      { clientProfileId: "profile-created" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });
});

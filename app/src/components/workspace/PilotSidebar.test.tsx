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

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    if (namespace === "campaign.pilotSidebar") {
      const labels: Record<string, string> = {
        clientProfileLabel: "Perfil do cliente",
        linkedBadge: "Vinculado",
        pendingBadge: "Pendente",
        noProfileLinked: "Sem perfil vinculado",
        createProfileFromClient: "Criar perfil a partir deste cliente",
        createClientProfile: "Criar cliente",
        newClientTitle: "Qual é o cliente desta campanha?",
        newClientDescription: "Informe o nome do cliente para criar o perfil.",
        clientNameLabel: "Nome do cliente",
        clientNamePlaceholder: "Ex.: Acme",
        existingClientLabel: "Ou vincule um cliente existente",
        saving: "Salvando…",
        addClientNameHint: "Adicione um nome de cliente à campanha para criar um perfil.",
        profileLinkHelp: "Necessário para aprendizados e revisão de qualidade.",
        toastProfileLinked: "Perfil de cliente vinculado à campanha.",
        toastProfileLinkFailed: "Não foi possível vincular o perfil.",
        toastProfileCreatedAndLinked: "Perfil criado e vinculado à campanha.",
        toastProfileCreatedLinkFailed: "Perfil criado, mas não foi possível vincular.",
        toastProfileCreateFailed: "Não foi possível criar o perfil.",
        pilotBadge: "Piloto",
        pilotImageAlt: "Imagem do piloto",
        briefingSummaryLabel: "Resumo do briefing",
        briefingRowObjective: "Objetivo",
        briefingRowAudience: "Audiência",
        briefingRowTone: "Tom de voz",
        briefingRowPlatforms: "Plataformas",
        briefingRowCta: "Chamada para ação",
        briefingReadinessSummary: "Briefing e readiness",
      };
      return labels[key] ?? key;
    }
    return key;
  },
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

    fireEvent.change(screen.getByLabelText("Ou vincule um cliente existente"), {
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

    fireEvent.click(screen.getByRole("button", { name: "Criar cliente" }));

    expect(createProfileMutate).toHaveBeenCalledWith(
      { name: "CENBRAP" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(updateCampaignMutate).toHaveBeenCalledWith(
      { clientProfileId: "profile-created", client: "CENBRAP" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });
});

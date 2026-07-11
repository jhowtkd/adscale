import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ClientProfileLinkControl from "./ClientProfileLinkControl";

const {
  addToast,
  createProfileMutate,
  updateCampaignMutate,
  useClientProfilesMock,
} = vi.hoisted(() => ({
  addToast: vi.fn(),
  createProfileMutate: vi.fn(),
  updateCampaignMutate: vi.fn(),
  useClientProfilesMock: vi.fn(),
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
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      clientProfileLabel: "Perfil do cliente",
      linkedBadge: "Vinculado",
      newClientTitle: "Qual é o cliente desta campanha?",
      newClientDescription: "Informe o nome do cliente para criar o perfil.",
      clientNameLabel: "Nome do cliente",
      clientNamePlaceholder: "Ex.: Acme",
      existingClientLabel: "Ou vincule um cliente existente",
      noProfileLinked: "Sem perfil vinculado",
      createClientProfile: "Criar cliente",
      saving: "Salvando…",
      profileLinkHelp: "Necessário para aprendizados.",
      toastProfileLinked: "Perfil vinculado.",
      toastProfileLinkFailed: "Falha ao vincular.",
      toastProfileCreatedAndLinked: "Perfil criado e vinculado.",
      toastProfileCreatedLinkFailed: "Perfil criado, mas falhou ao vincular.",
      toastProfileCreateFailed: "Falha ao criar perfil.",
    };
    return labels[key] ?? key;
  },
}));

describe("ClientProfileLinkControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClientProfilesMock.mockReturnValue({ data: [], isLoading: false });
    updateCampaignMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.();
    });
    createProfileMutate.mockImplementation((_payload, options) => {
      options?.onSuccess?.({ id: "profile-created", name: "Acme" });
    });
  });

  it("shows an input to create a new client when no profile is linked", () => {
    render(
      <ClientProfileLinkControl
        campaignId="campaign-1"
        clientName=""
        clientProfileId={null}
      />
    );

    expect(screen.getByLabelText("Nome do cliente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar cliente" })).toBeDisabled();
  });

  it("creates and links a client profile from the input field", () => {
    render(
      <ClientProfileLinkControl
        campaignId="campaign-1"
        clientName=""
        clientProfileId={null}
      />
    );

    fireEvent.change(screen.getByLabelText("Nome do cliente"), {
      target: { value: "Acme" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar cliente" }));

    expect(createProfileMutate).toHaveBeenCalledWith(
      { name: "Acme" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    expect(updateCampaignMutate).toHaveBeenCalledWith(
      { clientProfileId: "profile-created", client: "Acme" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("lets the operator link an existing client profile", () => {
    useClientProfilesMock.mockReturnValue({
      data: [{ id: "profile-1", name: "CENBRAP" }],
      isLoading: false,
    });

    render(
      <ClientProfileLinkControl
        campaignId="campaign-1"
        clientName="CENBRAP"
        clientProfileId={null}
      />
    );

    fireEvent.change(screen.getByLabelText("Ou vincule um cliente existente"), {
      target: { value: "profile-1" },
    });

    expect(updateCampaignMutate).toHaveBeenCalledWith(
      { clientProfileId: "profile-1" },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("lets the operator unlink a linked client profile", () => {
    useClientProfilesMock.mockReturnValue({
      data: [
        { id: "profile-1", name: "CENBRAP" },
        { id: "profile-2", name: "Acme" },
      ],
      isLoading: false,
    });

    render(
      <ClientProfileLinkControl
        campaignId="campaign-1"
        clientName="CENBRAP"
        clientProfileId="profile-1"
      />
    );

    fireEvent.change(screen.getByLabelText("Perfil do cliente"), {
      target: { value: "none" },
    });

    expect(updateCampaignMutate).toHaveBeenCalledWith(
      { clientProfileId: null },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });
});

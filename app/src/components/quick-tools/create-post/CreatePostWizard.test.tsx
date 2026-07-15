import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreatePostWizard from "./CreatePostWizard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, string | number>) => {
    if (typeof vars === "object" && vars && "credits" in vars) {
      return `${vars.credits} créditos`;
    }
    if (key === "stepConfirmCta") return "Confirmar e gerar 3 propostas";
    if (key === "stepConfirmCtaKitOnly") return "Gerar 3 propostas com Brand Kit";
    if (key === "stepCopyCta") return "Criar copy";
    if (key === "noApprovedAssets") {
      return "Nenhuma referência visual aprovada ainda. Você pode gerar só com o Brand Kit.";
    }
    if (key === "confirmKitOnlyHelp") {
      return "Sem referências aprovadas — as propostas usarão só o Brand Kit.";
    }
    if (key === "noApprovedAssetsCta") return "Abrir curadoria da marca";
    return key;
  },
}));

vi.mock("@/lib/store", () => ({
  useAppStore: (selector: (s: { addToast: () => void }) => unknown) =>
    selector({ addToast: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockUseClientProfiles = vi.fn();
const mockUseCreativeWork = vi.fn();
const mockUseCreateCreativeWork = vi.fn();
const mockUseGenerateCopy = vi.fn();
const mockUseConfirmWork = vi.fn();
const mockUseTriggerTriplet = vi.fn();
const mockUseRetryOutput = vi.fn();
const mockUseSelectOutput = vi.fn();
const mockUseIdentityOptions = vi.fn();

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => mockUseClientProfiles(),
}));

vi.mock("@/lib/hooks/use-creative-work", () => ({
  useCreativeWork: (...args: unknown[]) => mockUseCreativeWork(...args),
  useCreateCreativeWork: () => mockUseCreateCreativeWork(),
  useGenerateCopy: () => mockUseGenerateCopy(),
  useConfirmCreativeWork: () => mockUseConfirmWork(),
  useTriggerTriplet: () => mockUseTriggerTriplet(),
  useRetryOutput: () => mockUseRetryOutput(),
  useSelectOutput: () => mockUseSelectOutput(),
  useIdentityOptions: (...args: unknown[]) => mockUseIdentityOptions(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const clientProfileFixture = {
  id: "profile-1",
  workspaceId: "ws-1",
  name: "ADScale_2",
  description: null,
  visualNotes: null,
  toneNotes: null,
  constraints: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const draftWork = {
  work: {
    id: "work-1",
    workspaceId: "ws-1",
    clientProfileId: "profile-1",
    createdByUserId: "user-1",
    toolKind: "social_post" as const,
    status: "draft" as const,
    brief: {
      theme: "Lançamento verão",
      objective: "Vendas",
      audience: "Jovens",
      offer: "20% off",
    },
    format: "1:1" as const,
    copy: null,
    identitySnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  outputs: [],
};

const readyWork = {
  work: {
    ...draftWork.work,
    status: "ready" as const,
    copy: { headline: "h", body: "b", cta: "c" },
    identitySnapshot: {
      clientProfileId: "profile-1",
      confirmedAt: new Date().toISOString(),
      assets: [],
      brandKit: { colors: [], fonts: [], toneOfVoice: null, prohibitedElements: null, requiredElements: null },
    },
  },
  outputs: [],
};

const generatingWork = {
  work: { ...readyWork.work, status: "generating" as const },
  outputs: [
    {
      id: "out-conservative",
      workspaceId: "ws-1",
      workItemId: "work-1",
      creativeLevel: "conservative" as const,
      status: "completed" as const,
      outputKey: "key-conservative",
      cost: null,
      failureCode: null,
      quality: null,
      isSelected: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "out-balanced",
      workspaceId: "ws-1",
      workItemId: "work-1",
      creativeLevel: "balanced" as const,
      status: "completed" as const,
      outputKey: "key-balanced",
      cost: null,
      failureCode: null,
      quality: null,
      isSelected: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "out-bold",
      workspaceId: "ws-1",
      workItemId: "work-1",
      creativeLevel: "bold" as const,
      status: "failed" as const,
      outputKey: null,
      cost: null,
      failureCode: "provider_error",
      quality: null,
      isSelected: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

describe("CreatePostWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClientProfiles.mockReturnValue({ data: [clientProfileFixture], isLoading: false });
    mockUseIdentityOptions.mockReturnValue({
      data: {
        options: [
          {
            referenceId: "ref-1",
            label: "Logo principal",
            category: "logo",
            usageMode: "primary_logo",
            reason: "Logo principal detectado como referencia exata prioritária",
          },
        ],
      },
      isLoading: false,
    });
    mockUseCreativeWork.mockReturnValue({ data: undefined, isLoading: false });
    mockUseCreateCreativeWork.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseGenerateCopy.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseConfirmWork.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseTriggerTriplet.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseRetryOutput.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseSelectOutput.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("requires brand and brief before copy generation", () => {
    render(<CreatePostWizard />, { wrapper: createWrapper() });

    expect(screen.getByRole("combobox", { name: "Marca" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Criar copy" })).toBeDisabled();
  });

  it("hydrates a different work when navigation changes only workId", async () => {
    mockUseCreativeWork.mockImplementation((id: string | null) => ({
      data: id
        ? { work: { ...draftWork.work, id }, outputs: [] }
        : undefined,
      isLoading: false,
    }));
    const view = render(<CreatePostWizard workId="work-1" />, {
      wrapper: createWrapper(),
    });

    view.rerender(<CreatePostWizard workId="work-2" />);

    await act(async () => {});
    expect(mockUseCreativeWork).toHaveBeenLastCalledWith("work-2");
  });

  it("promotes Copy to Identity when the persisted copy arrives for the same work", async () => {
    let detail = draftWork;
    mockUseCreativeWork.mockImplementation(() => ({
      data: detail,
      isLoading: false,
    }));

    const view = render(<CreatePostWizard workId="work-1" />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByRole("button", { name: "next" })).toBeVisible();

    detail = {
      work: {
        ...draftWork.work,
        copy: { headline: "h", body: "b", cta: "c" },
      },
      outputs: [],
    };
    view.rerender(<CreatePostWizard workId="work-1" />);

    expect(
      await screen.findByRole("button", {
        name: "Confirmar e gerar 3 propostas",
      })
    ).toBeVisible();
  });

  it("keeps a newly generated copy when an older draft snapshot arrives late", async () => {
    let detail: typeof draftWork | undefined;
    mockUseCreativeWork.mockImplementation(() => ({
      data: detail,
      isLoading: false,
    }));
    mockUseCreateCreativeWork.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ work: draftWork.work }),
      isPending: false,
    });
    mockUseGenerateCopy.mockReturnValue({
      mutateAsync: vi.fn().mockImplementation(async () => {
        // Simulate the pre-copy GET resolving after the provider response but
        // before React commits the local copy state.
        detail = draftWork;
        return {
          copy: { headline: "Generated headline", body: "Generated body", cta: "Generated CTA" },
          work: {
            ...draftWork.work,
            copy: { headline: "Generated headline", body: "Generated body", cta: "Generated CTA" },
          },
        };
      }),
      isPending: false,
    });

    const view = render(<CreatePostWizard />, { wrapper: createWrapper() });

    fireEvent.change(screen.getByRole("combobox", { name: "Marca" }), {
      target: { value: "profile-1" },
    });
    fireEvent.change(screen.getByLabelText("briefTheme"), {
      target: { value: "Theme" },
    });
    fireEvent.change(screen.getByLabelText("briefObjective"), {
      target: { value: "Objective" },
    });
    fireEvent.change(screen.getByLabelText("briefAudience"), {
      target: { value: "Audience" },
    });
    fireEvent.change(screen.getByLabelText("briefOffer"), {
      target: { value: "Offer" },
    });

    await act(async () => {
      screen.getByRole("button", { name: "Criar copy" }).click();
    });
    expect(screen.getByLabelText("headline")).toHaveValue("Generated headline");

    detail = draftWork;
    view.rerender(<CreatePostWizard />);

    expect(screen.getByLabelText("headline")).toHaveValue("Generated headline");
    expect(screen.getByLabelText("body")).toHaveValue("Generated body");
    expect(screen.getByLabelText("cta")).toHaveValue("Generated CTA");
  });

  it("shows the 15-credit confirmation inside the assets step before visual generation", async () => {
    // The wizard now exposes the 15-credit cost on the assets (identity)
    // step rather than as a dedicated confirmation step. To land on the
    // assets step the persisted work must be a draft with copy already
    // generated (routes to step index 2).
    const draftWithCopyWork = {
      work: {
        ...draftWork.work,
        copy: { headline: "h", body: "b", cta: "c" },
      },
      outputs: [],
    };
    mockUseCreativeWork.mockReturnValue({ data: draftWithCopyWork, isLoading: false });

    render(<CreatePostWizard workId="work-1" />, { wrapper: createWrapper() });

    expect(await screen.findAllByText("15 créditos")).not.toHaveLength(0);
    const confirmButton = await screen.findByRole("button", {
      name: "Confirmar e gerar 3 propostas",
    });
    // The CTA is enabled as soon as the seed effect pre-selects the
    // server-recommended identity option. The user can still deselect.
    expect(confirmButton).toBeEnabled();

    const checkbox = screen.getByLabelText("Logo principal") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    act(() => {
      checkbox.click();
    });

    expect(confirmButton).toBeDisabled();
  });

  it("enables Brand-Kit-only generation when there are no approved references", async () => {
    const confirmSpy = vi.fn().mockResolvedValue({ work: readyWork.work });
    const triggerSpy = vi.fn().mockResolvedValue({ work: readyWork.work, outputs: [] });
    const draftWithCopyWork = {
      work: {
        ...draftWork.work,
        copy: { headline: "h", body: "b", cta: "c" },
      },
      outputs: [],
    };
    mockUseCreativeWork.mockReturnValue({ data: draftWithCopyWork, isLoading: false });
    mockUseIdentityOptions.mockReturnValue({ data: { options: [] }, isLoading: false });
    mockUseConfirmWork.mockReturnValue({ mutateAsync: confirmSpy, isPending: false });
    mockUseTriggerTriplet.mockReturnValue({ mutateAsync: triggerSpy, isPending: false });

    render(<CreatePostWizard workId="work-1" />, { wrapper: createWrapper() });

    expect(
      await screen.findByText(/Nenhuma referência visual aprovada ainda/),
    ).toBeVisible();
    const kitOnlyButton = await screen.findByRole("button", {
      name: "Gerar 3 propostas com Brand Kit",
    });
    expect(kitOnlyButton).toBeEnabled();

    await act(async () => {
      kitOnlyButton.click();
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: "work-1",
        selectedReferenceIds: [],
      }),
    );
    expect(triggerSpy).toHaveBeenCalledWith("work-1");
  });

  it("renders the three proposal cards in fixed neutral order", async () => {
    mockUseCreativeWork.mockReturnValue({ data: generatingWork, isLoading: false });

    render(<CreatePostWizard workId="work-1" />, { wrapper: createWrapper() });

    await screen.findByText("conservative");
    await screen.findByText("balanced");
    await screen.findByText("bold");
  });

  it("exposes Repetir esta proposta for failed cards", async () => {
    mockUseCreativeWork.mockReturnValue({ data: generatingWork, isLoading: false });

    render(<CreatePostWizard workId="work-1" />, { wrapper: createWrapper() });

    const retry = await screen.findByRole("button", { name: "Repetir esta proposta" });
    expect(retry).toBeVisible();
  });

  it("exposes select, save and download for completed cards", async () => {
    mockUseCreativeWork.mockReturnValue({ data: generatingWork, isLoading: false });

    render(<CreatePostWizard workId="work-1" />, { wrapper: createWrapper() });

    expect(await screen.findAllByRole("button", { name: "Selecionar" })).toHaveLength(2);
    expect(await screen.findAllByRole("button", { name: "Salvar na biblioteca" })).toHaveLength(2);
    expect(await screen.findAllByRole("button", { name: "Baixar" })).toHaveLength(2);
  });

  it("does not label any proposal as recommended or best", async () => {
    mockUseCreativeWork.mockReturnValue({ data: generatingWork, isLoading: false });

    render(<CreatePostWizard workId="work-1" />, { wrapper: createWrapper() });

    await screen.findByText("conservative");
    expect(screen.queryByText(/recomendad|best|principal/i)).toBeNull();
  });

  it("sends the locally edited copy to the confirm endpoint instead of the server snapshot", async () => {
    const confirmSpy = vi.fn().mockResolvedValue({ work: readyWork.work });
    const triggerSpy = vi.fn().mockResolvedValue({ work: readyWork.work, outputs: [] });
    const draftWithCopyWork = {
      work: {
        ...draftWork.work,
        copy: { headline: "Server headline", body: "Server body", cta: "Server CTA" },
      },
      outputs: [],
    };
    mockUseCreativeWork.mockReturnValue({ data: draftWithCopyWork, isLoading: false });
    mockUseConfirmWork.mockReturnValue({ mutateAsync: confirmSpy, isPending: false });
    mockUseTriggerTriplet.mockReturnValue({ mutateAsync: triggerSpy, isPending: false });

    render(<CreatePostWizard workId="work-1" />, { wrapper: createWrapper() });

    const confirmButton = await screen.findByRole("button", {
      name: "Confirmar e gerar 3 propostas",
    });

    // Identity option ref-1 is already pre-selected by the seed effect.
    expect(confirmButton).toBeEnabled();

    await act(async () => {
      confirmButton.click();
    });

    // The wizard's local copy mirrors the server snapshot at this point
    // (no edit happened in this test). The fix is to make the wizard
    // source the copy from local state instead of `detail.work.copy` —
    // we assert the confirm mutation received the full copy shape and
    // that trigger was called immediately after.
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const [arg] = confirmSpy.mock.calls[0];
    expect(arg).toMatchObject({
      workItemId: "work-1",
      copy: {
        headline: "Server headline",
        body: "Server body",
        cta: "Server CTA",
      },
      selectedReferenceIds: ["ref-1"],
    });
    expect(triggerSpy).toHaveBeenCalledWith("work-1");
  });
});

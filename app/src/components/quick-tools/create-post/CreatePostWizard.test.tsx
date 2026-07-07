import { act, render, screen } from "@testing-library/react";
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
    if (key === "stepCopyCta") return "Criar copy";
    return key;
  },
}));

const mockUseClientProfiles = vi.fn();
const mockUseCreativeWork = vi.fn();
const mockUseCreateCreativeWork = vi.fn();
const mockUseGenerateCopy = vi.fn();
const mockUseConfirmWork = vi.fn();
const mockUseTriggerTriplet = vi.fn();
const mockUseRetryOutput = vi.fn();
const mockUseSelectOutput = vi.fn();
const mockUseClientReferences = vi.fn();

vi.mock("@/lib/hooks/use-client-profiles", () => ({
  useClientProfiles: () => mockUseClientProfiles(),
  useClientReferences: (...args: unknown[]) => mockUseClientReferences(...args),
}));

vi.mock("@/lib/hooks/use-creative-work", () => ({
  useCreativeWork: (...args: unknown[]) => mockUseCreativeWork(...args),
  useCreateCreativeWork: () => mockUseCreateCreativeWork(),
  useGenerateCopy: () => mockUseGenerateCopy(),
  useConfirmCreativeWork: () => mockUseConfirmWork(),
  useTriggerTriplet: () => mockUseTriggerTriplet(),
  useRetryOutput: () => mockUseRetryOutput(),
  useSelectOutput: () => mockUseSelectOutput(),
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

const approvedReferenceFixture = {
  id: "ref-1",
  workspaceId: "ws-1",
  clientProfileId: "profile-1",
  assetKey: "asset-1",
  label: "Logo principal",
  kind: "logo",
  notes: null,
  trainingCategory: "logo" as const,
  usageMode: "primary_logo" as const,
  reviewStatus: "approved" as const,
  sourceDerivationId: null,
  createdAt: new Date(),
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
    mockUseClientReferences.mockReturnValue({ data: [approvedReferenceFixture], isLoading: false });
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
    mockUseClientReferences.mockReturnValue({ data: [approvedReferenceFixture], isLoading: false });

    render(<CreatePostWizard workId="work-1" />, { wrapper: createWrapper() });

    expect(await screen.findAllByText("15 créditos")).not.toHaveLength(0);
    const confirmButton = await screen.findByRole("button", {
      name: "Confirmar e gerar 3 propostas",
    });
    // The CTA is disabled until the user selects at least one approved asset.
    expect(confirmButton).toBeDisabled();

    const checkbox = screen.getByLabelText("Logo principal") as HTMLInputElement;
    act(() => {
      checkbox.click();
    });

    expect(confirmButton).toBeEnabled();
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
});
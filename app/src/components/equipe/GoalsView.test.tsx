import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GoalsView from "./GoalsView";
import { apiFetch } from "@/lib/api-client";
import { EquipeCommandError } from "@/lib/equipe/commands";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = ((key: string, values?: Record<string, unknown>) => {
      let out = key;
      for (const [k, v] of Object.entries(values ?? {})) out = out.replace(`{${k}}`, String(v));
      return out;
    }) as ((key: string, values?: Record<string, unknown>) => string) & {
      has: () => boolean;
    };
    t.has = () => true;
    return t;
  },
  useLocale: () => "pt-BR",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/goals",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/hooks/use-workspace-assets", () => ({
  useWorkspaceAssets: () => ({
    data: {
      assets: [{ id: "asset-1", name: "logo.png", url: "https://assets.test/logo.png" }],
      total: 1,
    },
    isLoading: false,
  }),
}));

const { commandMocks } = vi.hoisted(() => ({
  commandMocks: {
    confirmEquipeScope: vi.fn(),
    registerEquipeMaterial: vi.fn(),
    approveEquipeContextSection: vi.fn(),
    answerEquipeConflict: vi.fn(),
    approveEquipePlan: vi.fn(),
    approveEquipeMandate: vi.fn(),
    approveEquipeBrandVoice: vi.fn(),
    agreeEquipeManualMode: vi.fn(),
    approveEquipeAutomaticPublication: vi.fn(),
  },
}));

vi.mock("@/lib/equipe/commands", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/equipe/commands")>();
  return { ...original, ...commandMocks };
});

const mockedFetch = vi.mocked(apiFetch);

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const ACCOUNT = {
  id: "acc-1",
  workspaceId: "ws-1",
  clientProfileId: "cp-1",
  status: "deploying",
  launchedAt: null,
  closedAt: null,
  notes: null,
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-06T00:00:00.000Z",
};

function step(stepKey: string, status: string, owner: string | null, dueAt: string | null) {
  return {
    id: `step-${stepKey}`,
    step: stepKey,
    status,
    owner,
    dueAt,
    remindersSent: 0,
    remindersCap: 3,
    completedAt: status === "done" ? "2026-10-07T00:00:00.000Z" : null,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
  };
}

const ONBOARDING = [
  step("scope_confirm", "done", "Ana", "2026-10-07T00:00:00.000Z"),
  step("materials", "done", "you", null),
  step("context", "in_progress", "you", "2026-10-16T00:00:00.000Z"),
  step("plan", "pending", null, null),
  step("mandate", "pending", null, null),
  step("connection", "pending", "Ana", "2026-10-20T00:00:00.000Z"),
  step("go_live", "pending", null, null),
];

const FRONT_SOCIAL = {
  id: "front-1",
  key: "social_instagram",
  status: "released",
  calibrationSequence: 3,
  roundsUsed: 3,
  releasedAt: "2026-11-13T00:00:00.000Z",
  calibrationStartedAt: "2026-10-26T00:00:00.000Z",
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-11-13T00:00:00.000Z",
};

const FRONT_MIDIA = {
  id: "front-2",
  key: "midia_paga",
  status: "calibrating",
  calibrationSequence: 2,
  roundsUsed: 2,
  releasedAt: null,
  calibrationStartedAt: "2026-10-26T00:00:00.000Z",
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-11-13T00:00:00.000Z",
};

const PLAN = {
  id: "plan-1",
  version: 3,
  status: "approved",
  content: { rhythm: "5 posts/week" },
  receiptId: "rc-plan",
  approvedAt: "2026-11-10T00:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
};

const MANDATE = {
  id: "mand-1",
  frontId: "front-2",
  version: 1,
  status: "approved",
  shadow: true,
  limits: null,
  window: null,
  validFrom: "2026-11-10T00:00:00.000Z",
  validUntil: "2026-12-10T00:00:00.000Z",
  stopCondition: null,
  receiptId: "rc-mand",
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
};

const DECISIONS = {
  scope: { confirmed: false, digest: null, note: null },
  materials: [],
  contextSections: [
    {
      section: "oferta",
      version: 2,
      versionId: "ctx-2",
      versionHash: "hash-contexto",
      fields: {
        offer: { status: "sustained", value: "frete grátis", source: "catálogo" },
        niche: { status: "unknown" },
      },
    },
  ],
  conflicts: [
    {
      section: "oferta",
      version: 2,
      versionId: "ctx-2",
      field: "shipping",
      question: "O frete vale acima de quanto?",
    },
  ],
  plan: { id: "plan-9", version: 1, versionHash: "hash-plano" },
  mandates: [{ id: "mand-9", version: 1, versionHash: "hash-mandato" }],
  brandVoice: { approved: false, versionHash: null },
  connection: { verified: false, manualAgreed: false },
  publication: {
    mode: "automatic",
    canApprove: false,
    blockedReason: null,
    versionHash: null,
    igAccount: null,
    mandateVersion: null,
    receiptId: null,
  },
};

function renderView(accountStatus: string, decisions: unknown = DECISIONS) {
  mockedFetch.mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/equipe/accounts") return json({ accounts: [ACCOUNT] });
    if (path === "/api/equipe/accounts/acc-1") {
      return json({
        workspaceId: "ws-1",
        accountId: "acc-1",
        status: accountStatus,
        fronts: [FRONT_SOCIAL, FRONT_MIDIA],
        pendingSteps: [],
        activePauses: [],
      });
    }
    if (path === "/api/equipe/accounts/acc-1/goals") {
      return json({
        workspaceId: "ws-1",
        accountId: "acc-1",
        plan: PLAN,
        mandates: [MANDATE],
        onboarding: ONBOARDING,
        decisions,
      });
    }
    throw new Error(`unexpected fetch ${path}`);
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GoalsView />
    </QueryClientProvider>,
  );
}

describe("GoalsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const mock of Object.values(commandMocks)) mock.mockResolvedValue({});
  });

  it("shows implantation steps with owner and deadline while deploying", async () => {
    renderView("deploying");
    expect(await screen.findByTestId("goals-implantation")).toBeInTheDocument();
    expect(screen.getByTestId("goals-step-scope_confirm")).toHaveTextContent("step_scope_confirm");
    expect(screen.getByTestId("goals-step-scope_confirm")).toHaveTextContent("Ana");
    expect(screen.getByTestId("goals-step-context")).toHaveTextContent("you");
    expect(screen.getByTestId("goals-step-context")).toHaveTextContent("dueAt");
    expect(screen.queryByTestId("goals-create")).not.toBeInTheDocument();
  });

  it("shows fronts, plan and mandates after activation", async () => {
    renderView("active");
    expect(await screen.findByTestId("goals-fronts")).toBeInTheDocument();
    expect(screen.getByTestId("goals-front-social_instagram")).toHaveTextContent("social_instagram");
    expect(screen.getByTestId("goals-front-midia_paga")).toHaveTextContent("roundsUsed");
    expect(screen.getByTestId("goals-plan")).toHaveTextContent("v3");
    expect(screen.getByTestId("goals-mandate-1")).toHaveTextContent("shadowMode");
    expect(screen.getByTestId("goals-create-sales")).toHaveAttribute("href", "/assistant");
    expect(screen.queryByTestId("goals-implantation")).not.toBeInTheDocument();
  });

  it("confirms the scope with the typed digest", async () => {
    renderView("deploying");
    fireEvent.change(await screen.findByTestId("goals-scope-digest"), {
      target: { value: "site + 8 posts/mês" },
    });
    fireEvent.click(screen.getByTestId("goals-scope-confirm"));
    await waitFor(() => {
      expect(commandMocks.confirmEquipeScope).toHaveBeenCalledWith("acc-1", {
        scopeDigest: "site + 8 posts/mês",
      });
    });
  });

  it("sends a material picked from the workspace assets", async () => {
    renderView("deploying");
    fireEvent.click(await screen.findByTestId("goals-material-pick-asset-1"));
    fireEvent.change(screen.getByTestId("goals-material-kind"), { target: { value: "logo" } });
    fireEvent.click(screen.getByTestId("goals-material-send"));
    await waitFor(() => {
      expect(commandMocks.registerEquipeMaterial).toHaveBeenCalledWith("acc-1", {
        assetId: "asset-1",
        kind: "logo",
      });
    });
  });

  it("approves the context section echoing the server hash", async () => {
    renderView("deploying");
    fireEvent.click(await screen.findByTestId("goals-section-approve-oferta"));
    await waitFor(() => {
      expect(commandMocks.approveEquipeContextSection).toHaveBeenCalledWith("acc-1", {
        section: "oferta",
        expectedVersionHash: "hash-contexto",
      });
    });
  });

  it("answers a fact conflict in place", async () => {
    renderView("deploying");
    fireEvent.change(await screen.findByTestId("goals-conflict-answer-oferta-shipping"), {
      target: { value: "Acima de R$150" },
    });
    fireEvent.click(screen.getByTestId("goals-conflict-send-oferta-shipping"));
    await waitFor(() => {
      expect(commandMocks.answerEquipeConflict).toHaveBeenCalledWith("acc-1", {
        section: "oferta",
        field: "shipping",
        answer: "Acima de R$150",
      });
    });
  });

  it("approves the plan and each mandate echoing their server hashes", async () => {
    renderView("deploying");
    fireEvent.click(await screen.findByTestId("goals-plan-approve"));
    await waitFor(() => {
      expect(commandMocks.approveEquipePlan).toHaveBeenCalledWith("acc-1", {
        expectedVersionHash: "hash-plano",
      });
    });
    fireEvent.click(screen.getByTestId("goals-mandate-approve-1"));
    await waitFor(() => {
      expect(commandMocks.approveEquipeMandate).toHaveBeenCalledWith("acc-1", {
        expectedVersionHash: "hash-mandato",
      });
    });
  });

  it("approves the brand voice text and agrees manual mode", async () => {
    renderView("deploying");
    fireEvent.change(await screen.findByTestId("goals-voice-text"), {
      target: { value: "direta, calorosa" },
    });
    fireEvent.click(screen.getByTestId("goals-voice-approve"));
    await waitFor(() => {
      expect(commandMocks.approveEquipeBrandVoice).toHaveBeenCalledWith("acc-1", {
        voice: "direta, calorosa",
      });
    });
    fireEvent.click(await screen.findByTestId("goals-manual-agree"));
    await waitFor(() => {
      expect(commandMocks.agreeEquipeManualMode).toHaveBeenCalledWith("acc-1");
    });
  });

  it("asks to review again when the decision went stale", async () => {
    commandMocks.approveEquipePlan.mockRejectedValueOnce(
      new EquipeCommandError("stale", 409, "stale_version"),
    );
    renderView("deploying");
    fireEvent.click(await screen.findByTestId("goals-plan-approve"));
    await waitFor(() => {
      expect(screen.getByTestId("goals-plan-error")).toHaveTextContent("staleVersion");
    });
  });

  it("explains a pending activation and approves it with the server hash", async () => {
    renderView("deploying", {
      ...DECISIONS,
      mandates: [{ id: "mand-2", version: 2, versionHash: "hash-ativacao", activation: true }],
    });
    const action = await screen.findByTestId("goals-action-mandate");
    expect(action).toHaveTextContent("mandateActivationExplainer");
    fireEvent.click(screen.getByTestId("goals-mandate-approve-2"));
    await waitFor(() => {
      expect(commandMocks.approveEquipeMandate).toHaveBeenCalledWith("acc-1", {
        expectedVersionHash: "hash-ativacao",
      });
    });
  });

  it("approves a pending activation from the mandates section on an active account", async () => {
    renderView("active", {
      ...DECISIONS,
      mandates: [{ id: "mand-2", version: 2, versionHash: "hash-ativacao", activation: true }],
    });
    expect(screen.queryByTestId("goals-implantation")).not.toBeInTheDocument();
    const action = await screen.findByTestId("goals-mandates-activation");
    expect(action).toHaveTextContent("mandateActivationExplainer");
    fireEvent.click(screen.getByTestId("goals-mandates-activation-approve-2"));
    await waitFor(() => {
      expect(commandMocks.approveEquipeMandate).toHaveBeenCalledWith("acc-1", {
        expectedVersionHash: "hash-ativacao",
      });
    });
  });

  it("approves automatic publication from Metas on an active account using the server hash", async () => {
    renderView("active", {
      ...DECISIONS,
      publication: {
        mode: "manual",
        canApprove: true,
        blockedReason: null,
        versionHash: "hash-publicacao",
        igAccount: "@brand",
        mandateVersion: 2,
        receiptId: "rc-manual",
      },
    });
    fireEvent.click(await screen.findByTestId("goals-publication-approve"));
    await waitFor(() => {
      expect(commandMocks.approveEquipeAutomaticPublication).toHaveBeenCalledWith("acc-1", {
        expectedVersionHash: "hash-publicacao",
      });
    });
  });

  it("hides or disables automatic publication approval when the server blocks it", async () => {
    renderView("active", {
      ...DECISIONS,
      publication: {
        mode: "manual",
        canApprove: false,
        blockedReason: "automatic_publication_requires_connection",
        versionHash: "hash-publicacao",
        igAccount: null,
        mandateVersion: null,
        receiptId: "rc-manual",
      },
    });
    expect(await screen.findByTestId("goals-publication-mode")).toHaveTextContent(
      "automatic_publication_requires_connection",
    );
    expect(screen.queryByTestId("goals-publication-approve")).not.toBeInTheDocument();
  });

  it("disables the approval while the server reports a publication block", async () => {
    renderView("active", {
      ...DECISIONS,
      publication: {
        mode: "manual",
        canApprove: true,
        blockedReason: "automatic_publication_requires_mandate",
        versionHash: "hash-publicacao",
        igAccount: null,
        mandateVersion: null,
        receiptId: "rc-manual",
      },
    });
    expect(await screen.findByTestId("goals-publication-approve")).toBeDisabled();
  });

  it("shows no activation action for a regular mandate on an active account", async () => {
    renderView("active", {
      ...DECISIONS,
      mandates: [{ id: "mand-9", version: 1, versionHash: "hash-mandato", activation: false }],
    });
    expect(await screen.findByTestId("goals-mandates")).toBeInTheDocument();
    expect(screen.queryByTestId("goals-mandates-activation")).not.toBeInTheDocument();
  });

  it("keeps the compact line for a regular mandate proposal", async () => {
    renderView("deploying", {
      ...DECISIONS,
      mandates: [{ id: "mand-9", version: 1, versionHash: "hash-mandato", activation: false }],
    });
    const action = await screen.findByTestId("goals-action-mandate");
    expect(action).not.toHaveTextContent("mandateActivationExplainer");
    expect(action).toHaveTextContent("mandateExplainer");
  });

  it("shows the API's reason when the step no longer allows the action", async () => {
    commandMocks.approveEquipePlan.mockRejectedValueOnce(
      new EquipeCommandError("conflict", 409, "invalid_transition", "no proposed plan version"),
    );
    renderView("deploying");
    fireEvent.click(await screen.findByTestId("goals-plan-approve"));
    await waitFor(() => {
      expect(screen.getByTestId("goals-plan-error")).toHaveTextContent("no proposed plan version");
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GoalsView from "./GoalsView";
import { apiFetch } from "@/lib/api-client";

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

function renderView(accountStatus: string) {
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
      });
    }
    if (path === "/api/equipe/accounts/acc-1/goals") {
      return json({ workspaceId: "ws-1", accountId: "acc-1", plan: PLAN, mandates: [MANDATE], onboarding: ONBOARDING });
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
});

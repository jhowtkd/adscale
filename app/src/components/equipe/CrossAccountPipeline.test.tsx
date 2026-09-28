import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "pt-BR",
}));

import { apiFetch } from "@/lib/api-client";
import CrossAccountPipeline from "./CrossAccountPipeline";
import type { CrossAccountEntryView, StaffRole } from "./types";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_SHADOW = "550e8400-e29b-41d4-a716-446655440002";
const ACCOUNT_PENDING = "550e8400-e29b-41d4-a716-446655440003";
const ACCOUNT_LIVE = "550e8400-e29b-41d4-a716-446655440004";
const MANDATE_ID = "550e8400-e29b-41d4-a716-446655440005";

function entry(
  accountId: string,
  mandate: CrossAccountEntryView["mandate"],
): CrossAccountEntryView {
  return {
    scope: { workspaceId: WORKSPACE_ID, accountId },
    brandName: "Café Aurora",
    workspaceName: "Agência Sul",
    escalations: [],
    exceptions: [],
    pauses: [],
    mandate,
  };
}

function mockAccounts(entries: CrossAccountEntryView[]) {
  mockApiFetch.mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/api/equipe/staff/accounts") {
      return { ok: true, status: 200, json: async () => ({ entries }) } as Response;
    }
    if (url === "/api/equipe/staff/commands") {
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

function renderPipeline(props: { activationRole?: StaffRole | null } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CrossAccountPipeline {...props} />
    </QueryClientProvider>,
  );
}

describe("CrossAccountPipeline mandate activation (#584)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows shadow-mandate accounts with a propose button behind a confirmation", async () => {
    mockAccounts([
      entry(ACCOUNT_SHADOW, {
        approved: { id: MANDATE_ID, version: 1, shadow: true },
        activationPending: null,
      }),
      entry(ACCOUNT_LIVE, {
        approved: { id: MANDATE_ID, version: 2, shadow: false },
        activationPending: null,
      }),
    ]);
    renderPipeline();

    // The shadow account surfaces even with nothing else open; the live
    // one stays out of the pipeline.
    const section = await screen.findByTestId(`staff-mandate-${ACCOUNT_SHADOW}`);
    expect(section).toHaveTextContent("equipe.accounts.mandateShadow");
    expect(screen.queryByTestId(`staff-mandate-${ACCOUNT_LIVE}`)).not.toBeInTheDocument();

    // Nothing is sent before the confirmation.
    fireEvent.click(screen.getByTestId("staff-mandate-propose"));
    expect(screen.getByTestId("staff-mandate-confirm")).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      "/api/equipe/staff/commands",
      expect.anything(),
    );
    fireEvent.click(screen.getByTestId("staff-mandate-cancel"));
    expect(screen.queryByTestId("staff-mandate-confirm")).not.toBeInTheDocument();
    expect(screen.getByTestId("staff-mandate-propose")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("staff-mandate-propose"));
    fireEvent.click(screen.getByTestId("staff-mandate-confirm"));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/equipe/staff/commands",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse(
      (mockApiFetch.mock.calls.find(([url]) => url === "/api/equipe/staff/commands")?.[1] as {
        body: string;
      }).body,
    );
    expect(body).toEqual({
      type: "propose_mandate_activation",
      payload: { mandateId: MANDATE_ID },
      role: "support",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_SHADOW,
    });
  });

  it("sends the held operations role for operations-only staff", async () => {
    mockAccounts([
      entry(ACCOUNT_SHADOW, {
        approved: { id: MANDATE_ID, version: 1, shadow: true },
        activationPending: null,
      }),
    ]);
    renderPipeline({ activationRole: "operations" });

    fireEvent.click(await screen.findByTestId("staff-mandate-propose"));
    fireEvent.click(screen.getByTestId("staff-mandate-confirm"));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/equipe/staff/commands",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse(
      (mockApiFetch.mock.calls.find(([url]) => url === "/api/equipe/staff/commands")?.[1] as {
        body: string;
      }).body,
    );
    expect(body).toEqual({
      type: "propose_mandate_activation",
      payload: { mandateId: MANDATE_ID },
      role: "operations",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_SHADOW,
    });
  });

  it("hides the propose button when neither role is held", async () => {
    mockAccounts([
      entry(ACCOUNT_SHADOW, {
        approved: { id: MANDATE_ID, version: 1, shadow: true },
        activationPending: null,
      }),
    ]);
    renderPipeline({ activationRole: null });

    const section = await screen.findByTestId(`staff-mandate-${ACCOUNT_SHADOW}`);
    expect(section).toHaveTextContent("equipe.accounts.mandateShadow");
    expect(screen.queryByTestId("staff-mandate-propose")).not.toBeInTheDocument();
  });

  it("shows the wait note while the activation pends the client", async () => {
    mockAccounts([
      entry(ACCOUNT_PENDING, {
        approved: { id: MANDATE_ID, version: 1, shadow: true },
        activationPending: { id: "mand-pending", version: 2 },
      }),
    ]);
    renderPipeline();

    expect(await screen.findByTestId("staff-mandate-pending")).toHaveTextContent(
      "equipe.accounts.mandateActivationPending",
    );
    expect(screen.queryByTestId("staff-mandate-propose")).not.toBeInTheDocument();
  });

  it("shows the API error when the proposal is refused", async () => {
    mockAccounts([
      entry(ACCOUNT_SHADOW, {
        approved: { id: MANDATE_ID, version: 1, shadow: true },
        activationPending: null,
      }),
    ]);
    mockApiFetch.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/equipe/staff/accounts") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            entries: [
              entry(ACCOUNT_SHADOW, {
                approved: { id: MANDATE_ID, version: 1, shadow: true },
                activationPending: null,
              }),
            ],
          }),
        } as Response;
      }
      return {
        ok: false,
        status: 409,
        json: async () => ({ code: "invalid_transition", error: "activation is already pending" }),
      } as Response;
    });
    renderPipeline();

    fireEvent.click(await screen.findByTestId("staff-mandate-propose"));
    fireEvent.click(screen.getByTestId("staff-mandate-confirm"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("equipe.staffErrors.invalidTransition");
    });
    // The confirmation stays open so staff can retry after reloading.
    expect(screen.getByTestId("staff-mandate-confirm")).toBeInTheDocument();
  });
});

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
import ExceptionsQueue from "./ExceptionsQueue";
import type { ExceptionsQueueView } from "./types";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440002";

function exception(overrides: Record<string, unknown> = {}) {
  return {
    id: "exc-1",
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    trigger: "critical_incident",
    reason: "Post com alegação de saúde saiu às 10:00.",
    attempts: 2,
    dueAt: "2026-11-18T12:12:00.000Z",
    ownerRole: "support",
    assigneeId: null,
    status: "open",
    resolvedAt: null,
    createdAt: "2026-11-18T10:12:00.000Z",
    ...overrides,
  };
}

function renderQueue(props: { workspaceId: string | null; accountId: string | null }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExceptionsQueue workspaceId={props.workspaceId} accountId={props.accountId} />
    </QueryClientProvider>,
  );
}

describe("ExceptionsQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the account picker without a scope", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        entries: [
          {
            scope: { workspaceId: WORKSPACE_ID, accountId: ACCOUNT_ID },
            escalations: [],
            exceptions: [exception()],
            pauses: [],
          },
        ],
      }),
    } as Response);

    renderQueue({ workspaceId: null, accountId: null });

    await waitFor(() => {
      expect(screen.getByText("equipe.exceptions.pickAccount")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /equipe\.common\.account/ });
    expect(link).toHaveAttribute(
      "href",
      `/admin/equipe/exceptions?workspaceId=${WORKSPACE_ID}&accountId=${ACCOUNT_ID}`,
    );
  });

  it("renders the queue with the AI reason, attempts and the breach highlighted", async () => {
    const view: ExceptionsQueueView = {
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      brandName: "Café Aurora",
      workspaceName: "Agência Sul",
      open: [
        { exception: exception({ id: "exc-1" }), slaBreached: true },
        {
          exception: exception({
            id: "exc-2",
            trigger: "out_of_contract_request",
            reason: "A Ana pediu Reels em dezembro.",
            attempts: 0,
            dueAt: "2026-11-20T12:00:00.000Z",
          }),
          slaBreached: false,
        },
      ],
    };
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => view,
    } as Response);

    renderQueue({ workspaceId: WORKSPACE_ID, accountId: ACCOUNT_ID });

    await waitFor(() => {
      expect(
        screen.getByText(/Post com alegação de saúde saiu às 10:00\./),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("equipe.labels.trigger.critical_incident")).toBeInTheDocument();
    expect(screen.getByText(/equipe\.common\.breached/)).toBeInTheDocument();
    expect(screen.getByText(/Café Aurora · Agência Sul/)).toBeInTheDocument();
  });

  it("shows the empty queue state", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ workspaceId: WORKSPACE_ID, accountId: ACCOUNT_ID, open: [] }),
    } as Response);

    renderQueue({ workspaceId: WORKSPACE_ID, accountId: ACCOUNT_ID });

    await waitFor(() => {
      expect(screen.getByText("equipe.exceptions.empty")).toBeInTheDocument();
    });
  });

  it("expands the conversation panel per exception", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        open: [{ exception: exception(), slaBreached: false }],
      }),
    } as Response);

    renderQueue({ workspaceId: WORKSPACE_ID, accountId: ACCOUNT_ID });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "equipe.exceptions.enterConversation" }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.exceptions.enterConversation" }));

    expect(screen.getByText("equipe.exceptions.messageLabel")).toBeInTheDocument();
    expect(screen.getByText("equipe.exceptions.contactTitle")).toBeInTheDocument();
    expect(screen.getByText("equipe.exceptions.closeTitle")).toBeInTheDocument();
  });

  it("posts staff messages through post_staff_message as support", async () => {
    mockApiFetch.mockImplementation(async (url, init) => {
      const href = String(url);
      if (href === "/api/equipe/staff/commands" && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          workspaceId: WORKSPACE_ID,
          accountId: ACCOUNT_ID,
          open: [{ exception: exception(), slaBreached: false }],
        }),
      } as Response;
    });

    renderQueue({ workspaceId: WORKSPACE_ID, accountId: ACCOUNT_ID });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "equipe.exceptions.enterConversation" }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.exceptions.enterConversation" }));
    fireEvent.change(screen.getByPlaceholderText("equipe.exceptions.messagePlaceholder"), {
      target: { value: "Oi, sou da equipe." },
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.exceptions.messageSend" }));

    await waitFor(() => {
      expect(screen.getByText("equipe.exceptions.messageSent")).toBeInTheDocument();
    });
    const commandCall = mockApiFetch.mock.calls.find(
      ([url]) => String(url) === "/api/equipe/staff/commands",
    );
    expect(commandCall).toBeDefined();
    expect(JSON.parse(String(commandCall![1]?.body))).toEqual({
      type: "post_staff_message",
      payload: { exceptionId: "exc-1", body: "Oi, sou da equipe." },
      role: "support",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });
  });
});

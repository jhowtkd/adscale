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
import EscalationDetail from "./EscalationDetail";
import type { EscalationDetailView } from "./types";

const mockApiFetch = vi.mocked(apiFetch);

const ESCALATION_ID = "550e8400-e29b-41d4-a716-446655440030";
const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440002";

function view(): EscalationDetailView {
  return {
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    brandName: "Café Aurora",
    workspaceName: "Agência Sul",
    escalation: {
      id: ESCALATION_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      frontId: "front-1",
      itemId: "item-1",
      kind: "content",
      severity: "critical",
      ownerRole: "quality",
      coOwnerRole: null,
      parts: [{ kind: "content", resolved: false }],
      dueAt: "2026-11-18T12:00:00.000Z",
      status: "open",
      cause: null,
      lessonCandidate: null,
      resolvedAt: null,
      createdAt: "2026-11-18T10:12:00.000Z",
    },
    parts: [{ kind: "content", resolved: false }],
    item: {
      id: "item-1",
      frontId: "front-1",
      batchId: null,
      status: "awaiting_approval",
      scheduledFor: null,
      deadlineAt: null,
      destination: null,
      currentVersionHash: "hash-v1",
      createdAt: "2026-11-18T10:00:00.000Z",
    },
    events: [
      {
        id: "ev-1",
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        actorType: "system",
        actorId: null,
        actorRole: null,
        eventType: "escalation.opened",
        objectType: "escalation",
        objectId: ESCALATION_ID,
        payload: { reason: "alegação de saúde" },
        occurredAt: "2026-11-18T10:12:00.000Z",
      },
      {
        id: "ev-2",
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        actorType: "staff",
        actorId: "staff-operations-1",
        actorRole: "operations",
        eventType: "connection.revoked",
        objectType: "escalation",
        objectId: ESCALATION_ID,
        payload: { connectionId: "conn-1" },
        occurredAt: "2026-11-18T10:16:00.000Z",
      },
    ],
    pauses: [
      {
        id: "pause-1",
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        frontId: "front-1",
        level: "publishing",
        scope: "front",
        origin: "content_incident",
        resumableBy: "quality",
        status: "active",
        reason: null,
        liftedAt: null,
        createdAt: "2026-11-18T10:12:00.000Z",
      },
    ],
    exception: null,
    isolatedConnections: [
      { id: "conn-1", provider: "instagram", accountId: ACCOUNT_ID, status: "active" },
    ],
  };
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EscalationDetail
        escalationId={ESCALATION_ID}
        workspaceId={WORKSPACE_ID}
        accountId={ACCOUNT_ID}
      />
    </QueryClientProvider>,
  );
}

describe("EscalationDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders history by actor, parts, item and covering pauses", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => view(),
    } as Response);

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("equipe.labels.eventType.escalation.opened")).toBeInTheDocument();
    });
    expect(screen.getByText(/equipe\.labels\.actorType\.system/)).toBeInTheDocument();
    expect(screen.getByText(/operations/)).toBeInTheDocument();
    expect(screen.getByText("equipe.escalation.partsTitle")).toBeInTheDocument();
    expect(screen.getByText(/equipe\.escalation\.partOpen/)).toBeInTheDocument();
    expect(screen.getByText("equipe.escalation.itemTitle")).toBeInTheDocument();
    expect(screen.getByText("equipe.escalation.pausesTitle")).toBeInTheDocument();
  });

  it("closes the escalation as the owner role with cause and lesson", async () => {
    mockApiFetch.mockImplementation(async (url, init) => {
      if (String(url) === "/api/equipe/staff/commands" && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => view() } as Response;
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("equipe.escalation.closeTitle")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.escalation.closeSubmit" }));

    await waitFor(() => {
      expect(screen.getByText("equipe.escalation.closeDone")).toBeInTheDocument();
    });
    const commandCall = mockApiFetch.mock.calls.find(
      ([url]) => String(url) === "/api/equipe/staff/commands",
    );
    expect(commandCall).toBeDefined();
    expect(JSON.parse(String(commandCall![1]?.body))).toEqual({
      type: "close_escalation",
      payload: { escalationId: ESCALATION_ID, cause: "model_error" },
      role: "quality",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });
  });

  it("shows the brand name in the header", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => view(),
    } as Response);

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText(/Café Aurora · Agência Sul/)).toBeInTheDocument();
    });
  });

  it("revokes a picked isolated connection as operations only", async () => {
    mockApiFetch.mockImplementation(async (url, init) => {
      if (String(url) === "/api/equipe/staff/commands" && init?.method === "POST") {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      return { ok: true, status: 200, json: async () => view() } as Response;
    });

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("equipe.escalation.revokeTitle")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("option", { name: "instagram · conn-1 · active" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("equipe.escalation.revokeConnection"), {
      target: { value: "conn-1" },
    });
    fireEvent.change(screen.getByLabelText("equipe.escalation.revokeReason"), {
      target: { value: "token vazado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.escalation.revokeSubmit" }));

    await waitFor(() => {
      expect(screen.getByText("equipe.escalation.revokeDone")).toBeInTheDocument();
    });
    const commandCall = mockApiFetch.mock.calls.find(
      ([url]) => String(url) === "/api/equipe/staff/commands",
    );
    expect(JSON.parse(String(commandCall![1]?.body))).toMatchObject({
      type: "revoke_connection",
      payload: { connectionId: "conn-1", escalationId: ESCALATION_ID, reason: "token vazado" },
      role: "operations",
    });
  });

  it("disables revoking when nothing is isolated", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ...view(), isolatedConnections: [] }),
    } as Response);

    renderDetail();

    await waitFor(() => {
      expect(screen.getByText("equipe.escalation.revokeNone")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: "equipe.escalation.revokeSubmit" }),
    ).toBeDisabled();
  });
});

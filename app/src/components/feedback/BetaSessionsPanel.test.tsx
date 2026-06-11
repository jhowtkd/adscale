import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BETA_SESSION_STORAGE_KEY } from "@/lib/beta-analytics/constants";
import { BetaSessionsPanel } from "./BetaSessionsPanel";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BetaSessionsPanel />
    </QueryClientProvider>
  );
}

describe("BetaSessionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("renders runbook stages after session start and sets sessionStorage", async () => {
    const sessionPayload = {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      cohortLabel: null,
      assistanceLevel: "hands_on",
      startedAt: new Date().toISOString(),
      endedAt: null,
      operatorNotes: {},
    };

    mockApiFetch.mockImplementation(async (url, init) => {
      const href = String(url);
      if (href.includes("activeOnly")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sessions: [] }),
        } as Response;
      }
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ session: sessionPayload }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${href}`);
    });

    renderPanel();

    fireEvent.change(screen.getByPlaceholderText("uuid"), {
      target: { value: WORKSPACE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));

    await waitFor(() => {
      expect(screen.getByText("Session setup")).toBeInTheDocument();
    });

    expect(sessionStorage.getItem(BETA_SESSION_STORAGE_KEY)).toBe(SESSION_ID);
    expect(screen.getByText(/Copy session ID/)).toBeInTheDocument();
  });

  it("shows Copied! after copying session ID", async () => {
    const sessionPayload = {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      cohortLabel: null,
      assistanceLevel: "hands_on",
      startedAt: new Date().toISOString(),
      endedAt: null,
      operatorNotes: {},
    };

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    mockApiFetch.mockImplementation(async (url, init) => {
      const href = String(url);
      if (href.includes("activeOnly")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sessions: [] }),
        } as Response;
      }
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ session: sessionPayload }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${href}`);
    });

    renderPanel();

    fireEvent.change(screen.getByPlaceholderText("uuid"), {
      target: { value: WORKSPACE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));

    await waitFor(() => {
      expect(screen.getByText(/Copy session ID/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Copy session ID/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    });
    expect(writeText).toHaveBeenCalledWith(SESSION_ID);
  });

  it("shows End session at the top when an active session is listed", async () => {
    const sessionPayload = {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      cohortLabel: null,
      assistanceLevel: "hands_on",
      startedAt: new Date().toISOString(),
      endedAt: null,
      operatorNotes: {},
    };

    mockApiFetch.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("activeOnly=true")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sessions: [sessionPayload] }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${href}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();
    });
    expect(screen.getByText("Active session")).toBeInTheDocument();
  });

  it("restores active session from sessionStorage on mount", async () => {
    sessionStorage.setItem(BETA_SESSION_STORAGE_KEY, SESSION_ID);

    const sessionPayload = {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      cohortLabel: null,
      assistanceLevel: "hands_on",
      startedAt: new Date().toISOString(),
      endedAt: null,
      operatorNotes: {},
    };

    mockApiFetch.mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes(`/beta-sessions/${SESSION_ID}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ session: sessionPayload }),
        } as Response;
      }
      if (href.includes("activeOnly=true")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sessions: [] }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${href}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();
    });
    expect(screen.getByText(`Session: ${SESSION_ID}`)).toBeInTheDocument();
  });

  it("ends session via PATCH and clears sessionStorage", async () => {
    const sessionPayload = {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      cohortLabel: null,
      assistanceLevel: "hands_on",
      startedAt: new Date().toISOString(),
      endedAt: null,
      operatorNotes: {},
    };

    let activeSessions = [sessionPayload];

    mockApiFetch.mockImplementation(async (url, init) => {
      const href = String(url);
      if (href.includes("activeOnly=true") && init?.method !== "PATCH") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sessions: activeSessions }),
        } as Response;
      }
      if (init?.method === "PATCH" && href.includes(SESSION_ID)) {
        activeSessions = [];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            session: { ...sessionPayload, endedAt: new Date().toISOString() },
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${href} ${init?.method ?? "GET"}`);
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "End session" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Start session" })).toBeInTheDocument();
    });
    expect(sessionStorage.getItem(BETA_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("renders all nine runbook stage labels", async () => {
    const sessionPayload = {
      id: SESSION_ID,
      workspaceId: WORKSPACE_ID,
      cohortLabel: null,
      assistanceLevel: "hands_on",
      startedAt: new Date().toISOString(),
      endedAt: null,
      operatorNotes: {},
    };

    mockApiFetch.mockImplementation(async (url, init) => {
      const href = String(url);
      if (href.includes("activeOnly")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sessions: [] }),
        } as Response;
      }
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ session: sessionPayload }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${href}`);
    });

    renderPanel();

    fireEvent.change(screen.getByPlaceholderText("uuid"), {
      target: { value: WORKSPACE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));

    await waitFor(() => {
      expect(screen.getByText("Client approval package")).toBeInTheDocument();
    });
  });
});

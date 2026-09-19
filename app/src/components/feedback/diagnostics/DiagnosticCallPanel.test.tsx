import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api-client";
import type { DiagnosticCallResultMirror } from "@/lib/diagnostics/types";
import { DiagnosticCallPanel } from "./DiagnosticCallPanel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

const apiFetchMock = vi.mocked(apiFetch);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function callResult(
  overrides?: Partial<DiagnosticCallResultMirror["content"]>,
): DiagnosticCallResultMirror {
  return {
    found: true,
    call: {
      origin: "journal",
      updatedAt: "2026-01-01T00:01:01.000Z",
      callId: "call-1",
      provider: "acme",
      requestedModel: "img-1",
      returnedModel: "img-1-turbo",
      providerRequestId: "req-1",
      inputTokens: 12,
      outputTokens: 34,
      stage: "image",
      operationId: "op-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
      status: "completed",
      validationFailed: false,
      contentRecorded: { availability: "redacted", policyVersion: "v3" },
      events: [],
    },
    content: {
      allowed: true,
      availability: "redacted",
      policyVersion: "v3",
      verbatim: false,
      truncated: true,
      auditId: "audit-1",
      ...overrides,
    },
    externalRefs: {},
    links: { origin: "server-config", items: [] },
  };
}

function renderCallPanel(isPlatformOwner = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DiagnosticCallPanel
        workspaceId="ws-1"
        workItemId="work-1"
        callId="call-1"
        isPlatformOwner={isPlatformOwner}
      />
    </QueryClientProvider>,
  );
}

function submitReason(reason: string) {
  fireEvent.change(screen.getByLabelText("reasonLabel"), {
    target: { value: reason },
  });
  fireEvent.click(screen.getByRole("button", { name: "load" }));
}

describe("DiagnosticCallPanel", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("fetches nothing until a reason is submitted", () => {
    renderCallPanel();
    expect(screen.getByText("needsReason")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("requires a non-empty reason before fetching", () => {
    renderCallPanel();
    fireEvent.click(screen.getByRole("button", { name: "load" }));
    expect(screen.getByText("reasonRequired")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("sends the reason and shows requested vs returned model with the mask warning", async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse(callResult()));
    renderCallPanel();
    submitReason("investigating ticket 42");

    expect(await screen.findByText("img-1")).toBeInTheDocument();
    expect(screen.getByText("img-1-turbo")).toBeInTheDocument();
    expect(screen.getByText("req-1")).toBeInTheDocument();
    expect(screen.getByText("maskWarning")).toBeInTheDocument();
    const url = String(apiFetchMock.mock.calls[0][0]);
    expect(url).toContain("reason=investigating+ticket+42");
    expect(url).toContain("workspaceId=ws-1");
  });

  it("shows metadata with a denied notice when content is not allowed", async () => {
    apiFetchMock.mockResolvedValueOnce(
      jsonResponse(callResult({ allowed: false, auditId: null })),
    );
    renderCallPanel();
    submitReason("support follow-up");

    expect(await screen.findByText("denied")).toBeInTheDocument();
    expect(screen.getByText("img-1")).toBeInTheDocument();
    expect(screen.queryByText("maskWarning")).not.toBeInTheDocument();
  });

  it("renders forbidden on 403 with a single attempt", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ code: "forbidden" }, 403));
    renderCallPanel();
    submitReason("support follow-up");

    expect(await screen.findByText("forbidden")).toBeInTheDocument();
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("never queries for non-owners", () => {
    renderCallPanel(false);
    submitReason("support follow-up");
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

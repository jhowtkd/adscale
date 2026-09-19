import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "@/lib/api-client";
import type {
  ListDiagnosticWorksResult,
  WorkDiagnosticsResultMirror,
} from "@/lib/diagnostics/types";
import { DiagnosticsTabPanel } from "./DiagnosticsTabPanel";

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

function listPage(
  overrides: Partial<ListDiagnosticWorksResult> = {},
): ListDiagnosticWorksResult {
  return {
    works: [
      {
        workspaceId: "ws-1",
        workItemId: "work-1",
        firstSeen: "2026-01-01T00:00:00.000Z",
        lastSeen: "2026-01-02T00:00:00.000Z",
        eventCount: 4,
        states: ["failed"],
      },
    ],
    nextCursor: null,
    ...overrides,
  };
}

function workDetail(
  overrides?: Partial<WorkDiagnosticsResultMirror["telemetry"]>,
): WorkDiagnosticsResultMirror {
  return {
    found: true,
    work: {
      origin: "canonical",
      updatedAt: "2026-01-02T00:00:00.000Z",
      workspaceId: "ws-1",
      workItemId: "work-1",
      clientProfileId: null,
      toolKind: null,
      status: "ready",
      title: "Launch banner",
      briefPresent: true,
      requestPresent: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      outputs: [],
      selection: {
        selectedOutputId: null,
        selectedBy: null,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      delivery: { origin: "canonical", recorded: false },
    },
    telemetry: {
      origin: "journal",
      status: "ok",
      updatedAt: "2026-01-02T00:00:00.000Z",
      partial: false,
      operationIds: ["op-1"],
      events: [
        {
          eventId: "e1",
          event: "model.call.failed",
          occurredAt: "2026-01-01T00:00:00.000Z",
          recordedAt: "2026-01-01T00:00:01.000Z",
          stage: "image",
          correlation: "full",
          context: { operationId: "op-1", releaseSha: "sha-1" },
          call: {
            callId: "call-1",
            provider: "acme",
            requestedModel: "img-1",
            returnedModel: null,
            providerRequestId: null,
          },
        },
        {
          eventId: "e2",
          event: "model.call.completed",
          occurredAt: "2026-01-01T00:01:00.000Z",
          recordedAt: "2026-01-01T00:01:01.000Z",
          durationMs: 800,
          stage: "image",
          correlation: "full",
          context: { operationId: "op-1", releaseSha: "sha-1" },
          call: {
            callId: "call-1",
            provider: "acme",
            requestedModel: "img-1",
            returnedModel: "img-1",
            providerRequestId: "req-1",
          },
        },
      ],
      nextCursor: null,
      ...overrides,
    },
    links: {
      origin: "server-config",
      items: [
        { destination: "sentry", url: "https://sentry.example/e/1", availability: "configured" },
        { destination: "inngest", url: null, availability: "unconfigured" },
        { destination: "langfuse", url: null, availability: "no_ref" },
      ],
    },
  };
}

function renderPanel(isPlatformOwner: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DiagnosticsTabPanel isPlatformOwner={isPlatformOwner} />
    </QueryClientProvider>,
  );
}

describe("DiagnosticsTabPanel", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders forbidden for non-owners without firing any request", () => {
    renderPanel(false);
    expect(screen.getByText("forbidden")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("lists works for the owner and applies the exact-id search", async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(listPage()))
      .mockResolvedValueOnce(jsonResponse(listPage()));
    renderPanel(true);

    expect(await screen.findByText("work-1")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("filters.workItemId"), {
      target: { value: "work-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "filters.search" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
    });
    const secondUrl = String(apiFetchMock.mock.calls[1][0]);
    expect(secondUrl).toContain("workItemId=work-9");
  });

  it("renders forbidden on 403 with a single attempt", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse({ code: "forbidden" }, 403));
    renderPanel(true);

    expect(await screen.findByText("forbidden")).toBeInTheDocument();
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("appends the next cursor page on load more", async () => {
    apiFetchMock
      .mockResolvedValueOnce(
        jsonResponse(listPage({ nextCursor: "cursor-1" })),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          listPage({
            works: [
              {
                workspaceId: "ws-1",
                workItemId: "work-2",
                firstSeen: "2026-01-01T00:00:00.000Z",
                lastSeen: "2026-01-02T00:00:00.000Z",
                eventCount: 2,
                states: ["completed"],
              },
            ],
            nextCursor: null,
          }),
        ),
      );
    renderPanel(true);

    expect(await screen.findByText("work-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "loadMore" }));

    expect(await screen.findByText("work-2")).toBeInTheDocument();
    expect(screen.getByText("work-1")).toBeInTheDocument();
    const secondUrl = String(apiFetchMock.mock.calls[1][0]);
    expect(secondUrl).toContain("cursor=cursor-1");
  });

  it("separates canonical state from telemetry and shows the recovered badge", async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(listPage()))
      .mockResolvedValueOnce(jsonResponse(workDetail()));
    renderPanel(true);

    fireEvent.click(await screen.findByText("work-1"));

    expect(await screen.findByText("canonicalOrigin")).toBeInTheDocument();
    expect(screen.getByText("telemetryOrigin")).toBeInTheDocument();
    expect(screen.getByText("Launch banner")).toBeInTheDocument();
    expect(
      screen.getByTestId("diagnostics-badge-recovered"),
    ).toBeInTheDocument();
  });

  it("keeps canonical visible when telemetry is unavailable", async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(listPage()))
      .mockResolvedValueOnce(
        jsonResponse(
          workDetail({
            status: "unavailable",
            updatedAt: null,
            partial: true,
            operationIds: [],
            events: [],
            nextCursor: null,
          }),
        ),
      );
    renderPanel(true);

    fireEvent.click(await screen.findByText("work-1"));

    expect(await screen.findByText("telemetryUnavailable")).toBeInTheDocument();
    expect(screen.getByText("Launch banner")).toBeInTheDocument();
    expect(screen.getByTestId("diagnostics-badge-partial")).toBeInTheDocument();
  });

  it("renders vendor anchors only for configured links", async () => {
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(listPage()))
      .mockResolvedValueOnce(jsonResponse(workDetail()));
    renderPanel(true);

    fireEvent.click(await screen.findByText("work-1"));

    const anchor = await screen.findByRole("link", { name: "open" });
    expect(anchor).toHaveAttribute("href", "https://sentry.example/e/1");
    expect(
      screen.getByTestId("diagnostics-link-inngest-unconfigured"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /inngest/i }),
    ).not.toBeInTheDocument();
  });

  it("copies only the opaque support id to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(window.navigator, { clipboard: { writeText } });
    apiFetchMock
      .mockResolvedValueOnce(jsonResponse(listPage()))
      .mockResolvedValueOnce(jsonResponse(workDetail()));
    renderPanel(true);

    fireEvent.click(await screen.findByText("work-1"));
    fireEvent.click(await screen.findByTestId("support-code-copy"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("work-1");
    });
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});

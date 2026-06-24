import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearningProposalsTab } from "./LearningProposalsTab";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const CLIENT_PROFILE_ID = "550e8400-e29b-41d4-a716-446655440003";

const normalProposal = {
  id: "550e8400-e29b-41d4-a716-446655440010",
  sliceKey: "slice-normal",
  primaryFailureReason: "visual_overload",
  rationale: "Normal proposal rationale",
  evidenceRefs: { stats: { count: 5 } },
};

const fixtureProposal = {
  id: "550e8400-e29b-41d4-a716-446655440011",
  sliceKey: "slice-fixture",
  primaryFailureReason: "voice_nuance",
  rationale: "Fixture-only proposal rationale",
  evidenceRefs: { stats: { count: 3 }, fixtureOnly: true },
};

function renderTab(
  props?: Partial<Parameters<typeof LearningProposalsTab>[0]>
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LearningProposalsTab
        workspaceId={WORKSPACE_ID}
        onOpenCalibration={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  );
}

function mockProposalsList(proposals: typeof normalProposal[]) {
  mockApiFetch.mockImplementation(async (url: string | RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);

    if (path.includes("/learning/proposals?") && !path.includes("/accept") && !path.includes("/reject")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ proposals }),
      } as Response;
    }

    if (path.includes("/accept")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response;
    }

    return { ok: false, status: 404 } as Response;
  });
}

describe("LearningProposalsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes clientProfileId in fetch URL when prop is set", async () => {
    mockProposalsList([normalProposal]);
    renderTab({ clientProfileId: CLIENT_PROFILE_ID });

    await screen.findByText(normalProposal.rationale);

    const listCall = mockApiFetch.mock.calls.find(([url]) =>
      String(url).includes("/learning/proposals?")
    );
    expect(listCall).toBeDefined();
    const fetchUrl = String(listCall![0]);
    expect(fetchUrl).toContain(`clientProfileId=${CLIENT_PROFILE_ID}`);
    expect(fetchUrl).toContain(`workspaceId=${WORKSPACE_ID}`);
  });

  it("isolates cache per clientProfileId via separate fetch URLs", async () => {
    mockProposalsList([normalProposal]);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenCalibration = vi.fn();

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <LearningProposalsTab
          workspaceId={WORKSPACE_ID}
          clientProfileId={CLIENT_PROFILE_ID}
          onOpenCalibration={onOpenCalibration}
        />
      </QueryClientProvider>
    );

    await screen.findByText(normalProposal.rationale);

    const otherProfileId = "550e8400-e29b-41d4-a716-446655440099";
    rerender(
      <QueryClientProvider client={client}>
        <LearningProposalsTab
          workspaceId={WORKSPACE_ID}
          clientProfileId={otherProfileId}
          onOpenCalibration={onOpenCalibration}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      const urls = mockApiFetch.mock.calls
        .filter(([url]) => String(url).includes("/learning/proposals?"))
        .map(([url]) => String(url));
      expect(urls.some((u) => u.includes(`clientProfileId=${CLIENT_PROFILE_ID}`))).toBe(true);
      expect(urls.some((u) => u.includes(`clientProfileId=${otherProfileId}`))).toBe(true);
    });
  });

  it("requires fixture acknowledgment checkbox before Accept is enabled", async () => {
    mockProposalsList([fixtureProposal]);
    renderTab({ clientProfileId: CLIENT_PROFILE_ID });

    const acceptButton = await screen.findByRole("button", { name: "Accept" });
    expect(acceptButton).toBeDisabled();

    const checkbox = screen.getByRole("checkbox", {
      name: /Reconheço que esta proposta usa apenas evidência de fixture/i,
    });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(acceptButton).toBeEnabled();
  });

  it("sends acknowledgeFixtureOnly: true on accept when fixture proposal acknowledged", async () => {
    mockProposalsList([fixtureProposal]);
    renderTab({ clientProfileId: CLIENT_PROFILE_ID });

    const checkbox = await screen.findByRole("checkbox", {
      name: /Reconheço que esta proposta usa apenas evidência de fixture/i,
    });
    fireEvent.click(checkbox);

    const acceptButton = screen.getByRole("button", { name: "Accept" });
    fireEvent.click(acceptButton);

    await waitFor(() => {
      const acceptCall = mockApiFetch.mock.calls.find(
        ([url, init]) =>
          String(url).includes(`/learning/proposals/${fixtureProposal.id}/accept`) &&
          init?.method === "POST"
      );
      expect(acceptCall).toBeDefined();
      expect(acceptCall![1]?.headers).toMatchObject({ "content-type": "application/json" });
      expect(JSON.parse(String(acceptCall![1]?.body))).toEqual({
        acknowledgeFixtureOnly: true,
      });
    });
  });

  it("keeps workspace-only fetch when clientProfileId is omitted (corpus panel)", async () => {
    mockProposalsList([normalProposal]);
    renderTab({ workspaceId: WORKSPACE_ID });

    await screen.findByText(normalProposal.rationale);

    const listCall = mockApiFetch.mock.calls.find(([url]) =>
      String(url).includes("/learning/proposals?")
    );
    const fetchUrl = String(listCall![0]);
    expect(fetchUrl).toContain(`workspaceId=${WORKSPACE_ID}`);
    expect(fetchUrl).not.toContain("clientProfileId=");
    expect(screen.getByRole("button", { name: "Generate proposals" })).toBeInTheDocument();
  });
});

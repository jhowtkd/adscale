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
import QualityEffortForm from "./QualityEffortForm";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440001";
const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440002";
const FRONT_ID = "550e8400-e29b-41d4-a716-446655440003";
const ROUND_ID = "550e8400-e29b-41d4-a716-446655440010";

function renderForm(roundId: string | null = ROUND_ID) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <QualityEffortForm
        workspaceId={WORKSPACE_ID}
        accountId={ACCOUNT_ID}
        frontId={FRONT_ID}
        roundId={roundId}
        idPrefix="effort-test"
      />
    </QueryClientProvider>,
  );
}

describe("QualityEffortForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("books minutes with an optional note through record_quality_effort as quality", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    renderForm();
    fireEvent.change(screen.getByLabelText("equipe.quality.effortMinutes"), {
      target: { value: "90" },
    });
    fireEvent.change(screen.getByLabelText("equipe.quality.effortNote"), {
      target: { value: "revisão do lote" },
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.quality.effortSubmit" }));

    await waitFor(() => {
      expect(screen.getByText("equipe.quality.effortDone")).toBeInTheDocument();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockApiFetch.mock.calls[0]!;
    expect(url).toBe("/api/equipe/staff/commands");
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "record_quality_effort",
      payload: { frontId: FRONT_ID, roundId: ROUND_ID, minutes: 90, note: "revisão do lote" },
      role: "quality",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });
  });

  it("omits the note and the round when absent", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    renderForm(null);
    fireEvent.change(screen.getByLabelText("equipe.quality.effortMinutes"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.quality.effortSubmit" }));

    await waitFor(() => {
      expect(screen.getByText("equipe.quality.effortDone")).toBeInTheDocument();
    });
    expect(JSON.parse(String(mockApiFetch.mock.calls[0]![1]?.body))).toEqual({
      type: "record_quality_effort",
      payload: { frontId: FRONT_ID, minutes: 30 },
      role: "quality",
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
    });
  });

  it("refuses out-of-range minutes without calling the API", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("equipe.quality.effortMinutes"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.quality.effortSubmit" }));

    expect(screen.getByRole("alert")).toHaveTextContent("equipe.quality.effortInvalid");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("shows API errors in plain language", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "round is not on front", code: "round_not_in_front" }),
    } as Response);

    renderForm();
    fireEvent.change(screen.getByLabelText("equipe.quality.effortMinutes"), {
      target: { value: "45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "equipe.quality.effortSubmit" }));

    await waitFor(() => {
      expect(
        screen.getByText("equipe.staffErrors.roundNotInFront"),
      ).toBeInTheDocument();
    });
  });
});

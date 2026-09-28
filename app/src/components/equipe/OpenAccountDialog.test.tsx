import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "pt-BR",
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { apiFetch } from "@/lib/api-client";
import OpenAccountDialog from "./OpenAccountDialog";
import type { OpenAccountCandidateView } from "./types";

const mockApiFetch = vi.mocked(apiFetch);

const WORKSPACE_A = "550e8400-e29b-41d4-a716-446655440001";
const WORKSPACE_B = "550e8400-e29b-41d4-a716-446655440002";
const BRAND_A1 = "660e8400-e29b-41d4-a716-446655440001";
const BRAND_A2 = "660e8400-e29b-41d4-a716-446655440002";
const BRAND_B1 = "660e8400-e29b-41d4-a716-446655440003";
const ACCOUNT_ID = "770e8400-e29b-41d4-a716-446655440001";

function candidates(): OpenAccountCandidateView[] {
  return [
    {
      workspace: { id: WORKSPACE_A, name: "Espaço A" },
      brands: [
        { id: BRAND_A1, name: "Marca A1" },
        { id: BRAND_A2, name: null },
      ],
      members: [
        { userId: "user-ana", name: "Ana", email: "ana@cliente.com" },
        { userId: "user-bruno", name: "Bruno", email: null },
        { userId: "user-carla", name: null, email: "carla@cliente.com" },
      ],
    },
    {
      workspace: { id: WORKSPACE_B, name: "Espaço B" },
      brands: [{ id: BRAND_B1, name: "Marca B1" }],
      members: [{ userId: "user-rui", name: "Rui", email: "rui@cliente.com" }],
    },
  ];
}

function renderDialog(canOpen = true, list: OpenAccountCandidateView[] = candidates()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OpenAccountDialog canOpen={canOpen} candidates={list} />
    </QueryClientProvider>,
  );
}

function openDialog() {
  fireEvent.click(screen.getByTestId("open-account-trigger"));
}

function chooseWorkspace(workspaceId: string) {
  fireEvent.change(screen.getByTestId("open-account-workspace"), {
    target: { value: workspaceId },
  });
}

describe("OpenAccountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is hidden for non-operations staff", () => {
    renderDialog(false);
    expect(screen.queryByTestId("open-account-trigger")).not.toBeInTheDocument();
  });

  it("submits open_account as operations with the picked workspace, brand, fronts and people", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ accountId: ACCOUNT_ID, events: [], data: {} }),
    } as Response);

    renderDialog();
    openDialog();
    chooseWorkspace(WORKSPACE_A);
    fireEvent.change(screen.getByTestId("open-account-brand"), {
      target: { value: BRAND_A1 },
    });
    // Both fronts ticked: social comes pre-ticked, midia is added.
    fireEvent.click(
      screen.getByRole("checkbox", { name: "equipe.fronts.midia_paga" }),
    );
    fireEvent.change(screen.getByTestId("open-account-approver"), {
      target: { value: "user-ana" },
    });
    fireEvent.change(screen.getByTestId("open-account-substitute"), {
      target: { value: "user-bruno" },
    });
    fireEvent.change(screen.getByTestId("open-account-custodian"), {
      target: { value: "user-carla" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Bruno" }));
    fireEvent.change(screen.getByTestId("open-account-note"), {
      target: { value: "contrato Anexo A" },
    });
    fireEvent.click(screen.getByTestId("open-account-submit"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockApiFetch.mock.calls[0]!;
    expect(url).toBe("/api/equipe/staff/commands");
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "open_account",
      payload: {
        clientProfileId: BRAND_A1,
        fronts: ["social_instagram", "midia_paga"],
        people: [
          { name: "Ana", role: "approver", userId: "user-ana", email: "ana@cliente.com" },
          { name: "Bruno", role: "substitute", userId: "user-bruno" },
          { name: "carla@cliente.com", role: "custodian", userId: "user-carla", email: "carla@cliente.com" },
          { name: "Bruno", role: "member", userId: "user-bruno" },
        ],
        notes: "contrato Anexo A",
      },
      role: "operations",
      workspaceId: WORKSPACE_A,
    });
    expect(screen.getByRole("status")).toHaveTextContent("equipe.openAccount.successTitle");
    expect(screen.getByRole("status")).toHaveTextContent("equipe.openAccount.successBody");
  });

  it("omits optionals and keeps only the required approver", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ accountId: ACCOUNT_ID, events: [], data: {} }),
    } as Response);

    renderDialog();
    openDialog();
    chooseWorkspace(WORKSPACE_B);
    fireEvent.change(screen.getByTestId("open-account-brand"), {
      target: { value: BRAND_B1 },
    });
    fireEvent.change(screen.getByTestId("open-account-approver"), {
      target: { value: "user-rui" },
    });
    fireEvent.click(screen.getByTestId("open-account-submit"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(JSON.parse(String(mockApiFetch.mock.calls[0]![1]?.body))).toEqual({
      type: "open_account",
      payload: {
        clientProfileId: BRAND_B1,
        fronts: ["social_instagram"],
        people: [{ name: "Rui", role: "approver", userId: "user-rui", email: "rui@cliente.com" }],
      },
      role: "operations",
      workspaceId: WORKSPACE_B,
    });
  });

  it("requires workspace, brand, a front and the approver without calling the API", () => {
    renderDialog();
    openDialog();

    fireEvent.click(screen.getByTestId("open-account-submit"));
    expect(screen.getByRole("alert")).toHaveTextContent("equipe.openAccount.workspaceRequired");

    chooseWorkspace(WORKSPACE_A);
    fireEvent.click(screen.getByTestId("open-account-submit"));
    expect(screen.getByRole("alert")).toHaveTextContent("equipe.openAccount.brandRequired");

    fireEvent.change(screen.getByTestId("open-account-brand"), {
      target: { value: BRAND_A1 },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "equipe.fronts.social_instagram" }),
    );
    fireEvent.click(screen.getByTestId("open-account-submit"));
    expect(screen.getByRole("alert")).toHaveTextContent("equipe.openAccount.frontsRequired");

    fireEvent.click(
      screen.getByRole("checkbox", { name: "equipe.fronts.social_instagram" }),
    );
    fireEvent.click(screen.getByTestId("open-account-submit"));
    expect(screen.getByRole("alert")).toHaveTextContent("equipe.openAccount.approverRequired");

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("refuses more than 20 people and a note past the limit", () => {
    const many = Array.from({ length: 21 }, (_, index) => ({
      userId: `user-${index}`,
      name: `Person ${index}`,
      email: null as string | null,
    }));
    renderDialog(true, [
      {
        workspace: { id: WORKSPACE_A, name: "Espaço A" },
        brands: [{ id: BRAND_A1, name: "Marca A1" }],
        members: many,
      },
    ]);
    openDialog();
    chooseWorkspace(WORKSPACE_A);
    fireEvent.change(screen.getByTestId("open-account-brand"), {
      target: { value: BRAND_A1 },
    });
    fireEvent.change(screen.getByTestId("open-account-approver"), {
      target: { value: "user-0" },
    });
    for (let index = 1; index < 21; index++) {
      fireEvent.click(screen.getByRole("checkbox", { name: `Person ${index}` }));
    }
    fireEvent.click(screen.getByTestId("open-account-submit"));
    expect(screen.getByRole("alert")).toHaveTextContent("equipe.openAccount.tooManyPeople");

    fireEvent.click(screen.getByRole("checkbox", { name: "Person 20" }));
    fireEvent.change(screen.getByTestId("open-account-note"), {
      target: { value: "x".repeat(2001) },
    });
    fireEvent.click(screen.getByTestId("open-account-submit"));
    expect(screen.getByRole("alert")).toHaveTextContent("equipe.openAccount.noteTooLong");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("resets people when the workspace changes", () => {
    renderDialog();
    openDialog();
    chooseWorkspace(WORKSPACE_A);
    fireEvent.change(screen.getByTestId("open-account-brand"), {
      target: { value: BRAND_A1 },
    });
    fireEvent.change(screen.getByTestId("open-account-approver"), {
      target: { value: "user-ana" },
    });

    chooseWorkspace(WORKSPACE_B);

    expect(screen.getByTestId("open-account-brand")).toHaveValue("");
    expect(screen.getByTestId("open-account-approver")).toHaveValue("");
    const dialog = screen.getByTestId("open-account-dialog");
    expect(within(dialog).queryByText("Ana")).not.toBeInTheDocument();
  });

  it("shows API errors in plain language", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "account exists", code: "account_already_exists" }),
    } as Response);

    renderDialog();
    openDialog();
    chooseWorkspace(WORKSPACE_A);
    fireEvent.change(screen.getByTestId("open-account-brand"), {
      target: { value: BRAND_A1 },
    });
    fireEvent.change(screen.getByTestId("open-account-approver"), {
      target: { value: "user-ana" },
    });
    fireEvent.click(screen.getByTestId("open-account-submit"));

    await waitFor(() => {
      expect(screen.getByText("equipe.staffErrors.accountAlreadyExists")).toBeInTheDocument();
    });
  });

  it("explains when no candidate is left to open", () => {
    renderDialog(true, []);
    openDialog();
    expect(screen.getByText("equipe.openAccount.emptyCandidates")).toBeInTheDocument();
    expect(screen.queryByTestId("open-account-submit")).not.toBeInTheDocument();
  });

  it("refuses the same person as approver and substitute without calling the API", () => {
    renderDialog();
    openDialog();
    chooseWorkspace(WORKSPACE_A);
    fireEvent.change(screen.getByTestId("open-account-brand"), {
      target: { value: BRAND_A1 },
    });
    fireEvent.change(screen.getByTestId("open-account-approver"), {
      target: { value: "user-ana" },
    });
    fireEvent.change(screen.getByTestId("open-account-substitute"), {
      target: { value: "user-ana" },
    });
    fireEvent.click(screen.getByTestId("open-account-submit"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "equipe.openAccount.substituteSameAsApprover",
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("refreshes candidates on success and hides the opened brand until the refresh lands", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ accountId: ACCOUNT_ID, events: [], data: {} }),
    } as Response);

    renderDialog();
    openDialog();
    chooseWorkspace(WORKSPACE_A);
    fireEvent.change(screen.getByTestId("open-account-brand"), {
      target: { value: BRAND_A1 },
    });
    fireEvent.change(screen.getByTestId("open-account-approver"), {
      target: { value: "user-ana" },
    });
    fireEvent.click(screen.getByTestId("open-account-submit"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("equipe.openAccount.openAnother"));

    const brandSelect = screen.getByTestId("open-account-brand") as HTMLSelectElement;
    const offered = [...brandSelect.options].map((option) => option.value);
    expect(offered).not.toContain(BRAND_A1);
    expect(offered).toContain(BRAND_A2);
  });
});

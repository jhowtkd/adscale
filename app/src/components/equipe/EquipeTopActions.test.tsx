import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EquipeTopActions from "./EquipeTopActions";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { pauseMock, supportMock } = vi.hoisted(() => ({ pauseMock: vi.fn(), supportMock: vi.fn() }));

vi.mock("@/lib/equipe/commands", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/equipe/commands")>();
  return { ...original, pauseEquipePublications: pauseMock, requestEquipeSupport: supportMock };
});

vi.mock("@/lib/equipe/use-equipe", () => ({
  useInvalidateEquipe: () => () => {},
}));

function renderActions(accountId: string | null = "acc-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EquipeTopActions active="pipeline" accountId={accountId} />
    </QueryClientProvider>,
  );
}

describe("EquipeTopActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pauseMock.mockResolvedValue({});
    supportMock.mockResolvedValue({});
  });

  it("links Painel to the conversation and Pipeline to the pipeline", () => {
    renderActions();
    expect(screen.getByTestId("equipe-view-painel")).toHaveAttribute("href", "/assistant");
    expect(screen.getByTestId("equipe-view-pipeline")).toHaveAttribute("href", "/pipeline");
  });

  it("pauses publications through the client pause command", async () => {
    renderActions();
    fireEvent.click(screen.getByTestId("equipe-pause-button"));
    expect(await screen.findByTestId("equipe-pause-dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("equipe-pause-reason"), { target: { value: "break" } });
    fireEvent.click(screen.getByTestId("equipe-pause-confirm"));
    await waitFor(() => {
      expect(pauseMock).toHaveBeenCalledWith("acc-1", { reason: "break" });
    });
  });

  it("asks for a person through request_support", async () => {
    renderActions();
    fireEvent.click(screen.getByTestId("equipe-support-button"));
    expect(await screen.findByTestId("equipe-support-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("equipe-support-confirm"));
    await waitFor(() => {
      expect(supportMock).toHaveBeenCalledWith("acc-1", { note: "" });
    });
  });

  it("disables commands without an account", () => {
    renderActions(null);
    expect(screen.getByTestId("equipe-pause-button")).toBeDisabled();
    expect(screen.getByTestId("equipe-support-button")).toBeDisabled();
  });
});

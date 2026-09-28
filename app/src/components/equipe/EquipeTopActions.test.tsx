import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EquipeTopActions from "./EquipeTopActions";
import { EquipeCommandError } from "@/lib/equipe/commands";
import { toast } from "sonner";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { pauseMock, supportMock, resumeMock } = vi.hoisted(() => ({
  pauseMock: vi.fn(),
  supportMock: vi.fn(),
  resumeMock: vi.fn(),
}));

vi.mock("@/lib/equipe/commands", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/equipe/commands")>();
  return {
    ...original,
    pauseEquipePublications: pauseMock,
    requestEquipeSupport: supportMock,
    resumeEquipePause: resumeMock,
  };
});

let accountStateFixture: { activePauses?: Array<{ id: string; origin: string; status: string }> } | null = null;

vi.mock("@/lib/equipe/use-equipe", () => ({
  useInvalidateEquipe: () => () => {},
  useEquipeAccountState: () => ({ data: accountStateFixture }),
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
    accountStateFixture = null;
    pauseMock.mockResolvedValue({});
    supportMock.mockResolvedValue({});
    resumeMock.mockResolvedValue({});
  });

  it("links Painel to the conversation and Pipeline to the pipeline", () => {
    renderActions();
    expect(screen.getByTestId("equipe-view-painel")).toHaveAttribute("href", "/assistant");
    expect(screen.getByTestId("equipe-view-pipeline")).toHaveAttribute(
      "href",
      "/pipeline?account=acc-1",
    );
  });

  it("keeps the actions on one row at desktop widths", () => {
    renderActions();
    expect(screen.getByTestId("equipe-top-actions")).toHaveClass("lg:flex-nowrap");
  });

  it("marks neither view active when the screen is not Painel nor Pipeline", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <EquipeTopActions active={null} accountId="acc-1" />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("equipe-view-painel")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("equipe-view-pipeline")).not.toHaveAttribute("aria-current");
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

  it("offers to resume while the client's own pause is active", async () => {
    accountStateFixture = { activePauses: [{ id: "pause-1", origin: "client", status: "active" }] };
    renderActions();
    expect(screen.queryByTestId("equipe-pause-button")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("equipe-resume-button"));
    expect(await screen.findByTestId("equipe-resume-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("equipe-resume-confirm"));
    await waitFor(() => {
      expect(resumeMock).toHaveBeenCalledWith("acc-1", { pauseId: "pause-1" });
    });
  });

  it("keeps the pause button for pauses from other origins", () => {
    accountStateFixture = { activePauses: [{ id: "pause-9", origin: "team", status: "active" }] };
    renderActions();
    expect(screen.getByTestId("equipe-pause-button")).toBeInTheDocument();
    expect(screen.queryByTestId("equipe-resume-button")).not.toBeInTheDocument();
  });

  it("explains in plain language when someone else must resume", async () => {
    accountStateFixture = { activePauses: [{ id: "pause-1", origin: "client", status: "active" }] };
    resumeMock.mockRejectedValueOnce(new EquipeCommandError("forbidden", 403, "forbidden_actor"));
    renderActions();
    fireEvent.click(screen.getByTestId("equipe-resume-button"));
    fireEvent.click(await screen.findByTestId("equipe-resume-confirm"));
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("resumeForbidden");
    });
  });
});

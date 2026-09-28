import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GlobalStopBanner from "./GlobalStopBanner";
import { StaffApiError } from "./staff-api";
import { toast } from "sonner";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
  useLocale: () => "pt-BR",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { fetchMock, sendMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("./staff-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./staff-api")>();
  return { ...original, staffFetchJson: fetchMock, sendStaffCommand: sendMock };
});

function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalStopBanner />
    </QueryClientProvider>,
  );
}

describe("GlobalStopBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({});
  });

  it("renders nothing while the state is loading", () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderBanner();
    expect(screen.queryByTestId("global-stop-banner")).not.toBeInTheDocument();
  });

  it("shows the running state with the stop button", async () => {
    fetchMock.mockResolvedValue({ entries: [], globalStop: { active: false } });
    renderBanner();
    expect(await screen.findByTestId("global-stop-banner")).toBeInTheDocument();
    expect(screen.getByTestId("global-stop-state")).toHaveTextContent("runningLabel");
    expect(screen.getByTestId("global-stop-button")).toHaveTextContent("stop");
  });

  it("shows who stopped, when and why while the stop is active", async () => {
    fetchMock.mockResolvedValue({
      entries: [],
      globalStop: {
        active: true,
        stopId: "stop-1",
        reason: "provedor instável",
        stoppedBy: "staff-1",
        stoppedByName: "Ops",
        stoppedAt: "2026-10-05T15:30:00.000Z",
      },
    });
    renderBanner();
    const state = await screen.findByTestId("global-stop-state");
    expect(state.textContent).toContain("stoppedSince");
    expect(state.textContent).toContain("Ops");
    expect(state.textContent).toContain("provedor instável");
    expect(screen.getByTestId("global-stop-button")).toHaveTextContent("resume");
  });

  it("stops everything through the staff command with the typed reason", async () => {
    fetchMock.mockResolvedValue({ entries: [], globalStop: { active: false } });
    renderBanner();
    fireEvent.click(await screen.findByTestId("global-stop-button"));
    expect(await screen.findByTestId("global-stop-dialog")).toBeInTheDocument();
    // Reason required: the confirm stays disabled while blank.
    expect(screen.getByTestId("global-stop-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("global-stop-reason"), {
      target: { value: "provedor instável" },
    });
    fireEvent.click(screen.getByTestId("global-stop-confirm"));
    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith({
        type: "stop_all_publications",
        payload: { reason: "provedor instável" },
        role: "operations",
      });
    });
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("stopDone");
    });
  });

  it("resumes through the staff command while the stop is active", async () => {
    fetchMock.mockResolvedValue({
      entries: [],
      globalStop: {
        active: true,
        stopId: "stop-1",
        reason: "provedor instável",
        stoppedBy: "staff-1",
        stoppedByName: "Ops",
        stoppedAt: "2026-10-05T15:30:00.000Z",
      },
    });
    renderBanner();
    fireEvent.click(await screen.findByTestId("global-stop-button"));
    expect(await screen.findByTestId("global-stop-dialog")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("global-stop-reason"), {
      target: { value: "provedor voltou" },
    });
    fireEvent.click(screen.getByTestId("global-stop-confirm"));
    await waitFor(() => {
      expect(sendMock).toHaveBeenCalledWith({
        type: "resume_all_publications",
        payload: { reason: "provedor voltou" },
        role: "operations",
      });
    });
    await waitFor(() => {
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("resumeDone");
    });
  });

  it("explains in plain language when the viewer is not operations", async () => {
    fetchMock.mockResolvedValue({ entries: [], globalStop: { active: false } });
    sendMock.mockRejectedValueOnce(new StaffApiError(403, "forbidden_actor", "no"));
    renderBanner();
    fireEvent.click(await screen.findByTestId("global-stop-button"));
    fireEvent.change(await screen.findByTestId("global-stop-reason"), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByTestId("global-stop-confirm"));
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith("forbidden");
    });
  });
});

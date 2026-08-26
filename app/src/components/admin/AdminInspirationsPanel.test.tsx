import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AdminInspirationsPanel } from "./AdminInspirationsPanel";

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminInspirationsPanel />
    </QueryClientProvider>
  );
}

describe("AdminInspirationsPanel", () => {
  it("offers a retry when inspirations loading fails", async () => {
    let calls = 0;
    mockApiFetch.mockImplementation(async () => {
      calls += 1;
      return { ok: false, status: 500 } as Response;
    });

    renderPanel();

    expect(
      await screen.findByText("Não foi possível carregar as inspirações.")
    ).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Tentar novamente" });
    const callsBeforeRetry = calls;
    fireEvent.click(retry);

    await waitFor(() => expect(calls).toBeGreaterThan(callsBeforeRetry));
  });
});

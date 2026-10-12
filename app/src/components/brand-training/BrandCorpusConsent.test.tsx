import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import { BrandCorpusConsent } from "./BrandCorpusConsent";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const source = namespace.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], ptBR);
    return key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], source) ?? key;
  },
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api-client";

const current = { purpose: "corpus_between_brands", canDecide: true, consent: null };
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status }); }
function mount(profile = "brand-a") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BrandCorpusConsent clientProfileId={profile} /></QueryClientProvider>);
}

describe("brand corpus consent", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(apiFetch).mockResolvedValue(response(current)); });

  it("explains the existing purpose and persists grant/revoke only after explicit confirmation", async () => {
    mount();
    const grantButton = await screen.findByRole("button", { name: "Conceder consentimento" });
    expect(screen.getByText(/corpus.*entre marcas/)).toBeInTheDocument();
    fireEvent.click(grantButton);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const granted = { status: "granted", currentEventId: "grant-1", updatedAt: "2026-10-01T12:00:00Z", reviewedByName: "Responsável" };
    vi.mocked(apiFetch).mockImplementation(async (_url, init) => response(init?.method === "PATCH" ? { consent: granted } : { ...current, consent: granted }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar concessão" }));
    await screen.findByText("Consentimento concedido");
    expect(apiFetch).toHaveBeenCalledWith("/api/client-profiles/brand-a", expect.objectContaining({ method: "PATCH", body: '{"action":"grant"}', headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }) }));
    expect(screen.getByText(/Responsável/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    const revoked = { ...granted, status: "revoked", currentEventId: "revoke-1" };
    vi.mocked(apiFetch).mockImplementation(async (_url, init) => response(init?.method === "PATCH" ? { consent: revoked } : { ...current, consent: revoked }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar revogação" }));
    await screen.findByText("Consentimento revogado");
    expect(apiFetch).toHaveBeenCalledWith("/api/client-profiles/brand-a", expect.objectContaining({ method: "PATCH", body: '{"action":"revoke"}' }));
    expect(vi.mocked(apiFetch).mock.calls.every(([url]) => String(url).startsWith("/api/client-profiles/"))).toBe(true);
  });

  it("shows members the state and responsible roles without mutation controls", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response({ ...current, canDecide: false }));
    mount();
    await screen.findByText(/owner ou admin/);
    expect(screen.getByText("Consentimento não concedido")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conceder consentimento" })).not.toBeInTheDocument();
  });

  it("keeps a failed decision open and retries with the same key", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Conceder consentimento" }));
    vi.mocked(apiFetch).mockRejectedValueOnce(new TypeError("network failure"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar concessão" }));
    await screen.findByRole("alert");
    expect(screen.getByText("Consentimento não concedido")).toBeInTheDocument();
    vi.mocked(apiFetch).mockImplementation(async (_url, init) => response(init?.method === "PATCH"
      ? { consent: { status: "granted", updatedAt: "2026-10-01T12:00:00Z" } }
      : { ...current, consent: { status: "granted", updatedAt: "2026-10-01T12:00:00Z" } }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar concessão" }));
    await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(2));
    const calls = vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(calls[0][1]?.headers).toEqual(calls[1][1]?.headers);
  });
});

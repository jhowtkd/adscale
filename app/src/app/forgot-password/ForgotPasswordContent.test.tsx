import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import ForgotPasswordContent from "./ForgotPasswordContent";

const mockRequestReset = vi.fn();
const mockSearchGet = vi.fn((): string | null => null);

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockSearchGet }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const msgs = namespace ? (ptBR as Record<string, unknown>)[namespace] || {} : ptBR;
    return (key: string) => (msgs as Record<string, string>)[key] || key;
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: (...args: unknown[]) => mockRequestReset(...args),
  },
}));

const CALLBACK = "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";

describe("ForgotPasswordContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRequestReset.mockReset();
    mockSearchGet.mockReset();
    mockSearchGet.mockImplementation(() => null);
  });

  it("carries the callback into the reset redirect and back-to-login links", async () => {
    mockSearchGet.mockImplementation((key: string) => (key === "callbackUrl" ? CALLBACK : null));
    mockRequestReset.mockResolvedValueOnce({ error: null });
    render(<ForgotPasswordContent />);

    const encoded = encodeURIComponent(CALLBACK);
    expect(screen.getByRole("link", { name: /voltar para entrar/i })).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encoded}`,
    );

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar link de redefinição/i }));

    await waitFor(() => {
      expect(mockRequestReset).toHaveBeenCalledWith({
        email: "user@example.com",
        redirectTo: `/reset-password?callbackUrl=${encoded}`,
      });
    });

    expect(await screen.findByRole("link", { name: /voltar para entrar/i })).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encoded}`,
    );
  });

  it("uses bare reset and login entries without a callback", async () => {
    mockRequestReset.mockResolvedValueOnce({ error: null });
    render(<ForgotPasswordContent />);

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar link de redefinição/i }));

    await waitFor(() => {
      expect(mockRequestReset).toHaveBeenCalledWith({
        email: "user@example.com",
        redirectTo: "/reset-password",
      });
    });
  });
});

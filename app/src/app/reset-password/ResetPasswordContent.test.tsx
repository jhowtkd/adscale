import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import ResetPasswordContent from "./ResetPasswordContent";

const mockPush = vi.fn();
const mockResetPassword = vi.fn();
const mockSearchGet = vi.fn((): string | null => null);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
    resetPassword: (...args: unknown[]) => mockResetPassword(...args),
  },
}));

const CALLBACK = "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";

describe("ResetPasswordContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockResetPassword.mockReset();
    mockSearchGet.mockReset();
    mockSearchGet.mockImplementation((key: string) => {
      if (key === "token") return "reset-token";
      return null;
    });
  });

  it("preserves the callback in links and in the post-reset redirect", async () => {
    mockSearchGet.mockImplementation((key: string) => {
      if (key === "token") return "reset-token";
      if (key === "callbackUrl") return CALLBACK;
      return null;
    });
    mockResetPassword.mockResolvedValueOnce({ error: null });
    render(<ResetPasswordContent />);

    const encoded = encodeURIComponent(CALLBACK);
    expect(screen.getByRole("link", { name: /voltar para entrar/i })).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encoded}`,
    );

    fireEvent.change(screen.getByLabelText("Nova senha", { exact: true }), {
      target: { value: "NewPassword123!" },
    });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
      target: { value: "NewPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /redefinir senha/i }));

    expect(await screen.findByText(/senha atualizada/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /voltar para entrar/i })).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encoded}`,
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/login?callbackUrl=${encoded}`), {
      timeout: 4000,
    });
  });
});

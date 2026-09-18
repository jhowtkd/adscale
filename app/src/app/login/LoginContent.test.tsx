import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import LoginContent from "./LoginContent";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockMagicLink = vi.fn();
const mockSearchGet = vi.fn((): string | null => null);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
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
    signIn: { magicLink: (...args: unknown[]) => mockMagicLink(...args) },
  },
}));

const CALLBACK = "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";

describe("LoginContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockRefresh.mockReset();
    mockMagicLink.mockReset();
    mockSearchGet.mockReset();
    mockSearchGet.mockImplementation(() => null);
  });

  it("preserves the callback in signup and forgot-password links", () => {
    mockSearchGet.mockImplementation((key: string) => (key === "callbackUrl" ? CALLBACK : null));
    render(<LoginContent />);

    const encoded = encodeURIComponent(CALLBACK);
    expect(screen.getByRole("link", { name: /criar conta/i })).toHaveAttribute(
      "href",
      `/signup?callbackUrl=${encoded}`,
    );
    expect(screen.getByRole("link", { name: /esqueceu a senha/i })).toHaveAttribute(
      "href",
      `/forgot-password?callbackUrl=${encoded}`,
    );
  });

  it("links to bare auth entries without a callback", () => {
    render(<LoginContent />);
    expect(screen.getByRole("link", { name: /criar conta/i })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: /esqueceu a senha/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("sends the callback with the magic link request", async () => {
    mockSearchGet.mockImplementation((key: string) => (key === "callbackUrl" ? CALLBACK : null));
    mockMagicLink.mockResolvedValueOnce({ error: null });
    render(<LoginContent />);

    fireEvent.click(screen.getByRole("button", { name: /entrar com link mágico/i }));
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar link mágico/i }));

    await waitFor(() => {
      expect(mockMagicLink).toHaveBeenCalledWith({ email: "user@example.com", callbackURL: CALLBACK });
    });
  });
});

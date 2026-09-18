import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import LoginContent from "./LoginContent";

const mockSearchParams = new URLSearchParams();
const mockMagicLink = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const msgs = namespace
      ? (ptBR as Record<string, unknown>)[namespace] || {}
      : ptBR;
    return (key: string) => (msgs as Record<string, string>)[key] || key;
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      magicLink: (...args: unknown[]) => mockMagicLink(...args),
    },
  },
}));

describe("LoginContent continuation (#441)", () => {
  const callback = "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.restoreAllMocks();
    mockMagicLink.mockReset();
    for (const key of [...mockSearchParams.keys()]) {
      mockSearchParams.delete(key);
    }
  });

  it("preserves the continuation in signup and forgot-password links", () => {
    mockSearchParams.set("callbackUrl", callback);
    render(<LoginContent />);
    const encoded = encodeURIComponent(callback);
    expect(
      screen.getByRole("link", { name: new RegExp(ptBR.auth.signUp) }),
    ).toHaveAttribute("href", `/signup?callbackUrl=${encoded}`);
    expect(
      screen.getByRole("link", { name: new RegExp(ptBR.auth.forgotPassword) }),
    ).toHaveAttribute("href", `/forgot-password?callbackUrl=${encoded}`);
  });

  it("sends the guestDraft continuation with the magic link", async () => {
    mockSearchParams.set("callbackUrl", callback);
    mockMagicLink.mockResolvedValueOnce({ error: null });
    render(<LoginContent />);
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(ptBR.auth.magicLink) }),
    );
    fireEvent.change(screen.getByLabelText(new RegExp(ptBR.auth.email)), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(ptBR.auth.sendMagicLink) }),
    );
    await waitFor(() => {
      expect(mockMagicLink).toHaveBeenCalledWith({
        email: "user@example.com",
        callbackURL: callback,
      });
    });
  });
});

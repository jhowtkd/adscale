import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import ForgotPasswordContent from "./ForgotPasswordContent";

const mockSearchParams = new URLSearchParams();
const mockRequestReset = vi.fn();

vi.mock("next/navigation", () => ({
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
    requestPasswordReset: (...args: unknown[]) => mockRequestReset(...args),
  },
}));

describe("ForgotPasswordContent continuation (#441)", () => {
  const callback = "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRequestReset.mockReset();
    for (const key of [...mockSearchParams.keys()]) {
      mockSearchParams.delete(key);
    }
  });

  it("carries the continuation into redirectTo and back-to-login links", async () => {
    mockSearchParams.set("callbackUrl", callback);
    mockRequestReset.mockResolvedValueOnce({ error: null });
    render(<ForgotPasswordContent />);
    fireEvent.change(screen.getByLabelText(new RegExp(ptBR.auth.email)), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(ptBR.auth.sendResetLink) }),
    );
    await waitFor(() => {
      expect(mockRequestReset).toHaveBeenCalledWith({
        email: "user@example.com",
        redirectTo: `/reset-password?callbackUrl=${encodeURIComponent(callback)}`,
      });
    });
    expect(
      screen.getByRole("link", { name: new RegExp(ptBR.auth.backToSignIn) }),
    ).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encodeURIComponent(callback)}`,
    );
  });
});

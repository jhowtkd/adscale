import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import ResetPasswordContent from "./ResetPasswordContent";

const mockSearchParams = new URLSearchParams();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
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
    resetPassword: vi.fn(async () => ({ error: null })),
  },
}));

describe("ResetPasswordContent continuation (#441)", () => {
  const callback = "/?compose=1&guestDraft=aa111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    for (const key of [...mockSearchParams.keys()]) {
      mockSearchParams.delete(key);
    }
  });

  it("keeps the recovery token separate and preserves the continuation in login links", () => {
    mockSearchParams.set("token", "recovery-token-123");
    mockSearchParams.set("callbackUrl", callback);
    render(<ResetPasswordContent />);
    const href = screen
      .getByRole("link", { name: new RegExp(ptBR.auth.backToSignIn) })
      .getAttribute("href") as string;
    expect(href).toBe(`/login?callbackUrl=${encodeURIComponent(callback)}`);
    expect(href).not.toContain("recovery-token-123");
  });

  it("still requires a token even with a valid continuation", () => {
    mockSearchParams.set("callbackUrl", callback);
    render(<ResetPasswordContent />);
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(ptBR.auth.resetPassword) }),
    );
    expect(
      screen.getByText(new RegExp(ptBR.auth.invalidResetToken)),
    ).toBeInTheDocument();
  });
});

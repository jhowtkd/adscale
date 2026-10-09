import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeOpenProblem from "./HomeOpenProblem";

const refresh = vi.fn();
const sendVerificationEmail = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/auth-client", () => ({ authClient: { sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args) } }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => (values?.owner ? `${key}:${values.owner}` : key),
}));

describe("HomeOpenProblem: every error of / has a way out (spec 2026-10-07 §4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an unverified email can ask for the confirmation again", async () => {
    sendVerificationEmail.mockResolvedValue({ data: {}, error: null });
    render(<HomeOpenProblem kind="verifyEmail" email="ana@example.test" />);
    expect(screen.getByText("homeVerifyEmail")).toHaveAttribute("role", "status");
    expect(screen.getByTestId("home-verify-sent")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "resendVerificationEmail" }));
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledWith({ email: "ana@example.test", callbackURL: "/" }));
    // The confirmation is announced (a live region), and the button stays off: one resend per visit.
    expect(await screen.findByText("verificationEmailSent")).toHaveAttribute("role", "status");
    expect(screen.getByRole("button", { name: "resendVerificationEmail" })).toBeDisabled();
  });

  it("a failed resend says so and keeps the button", async () => {
    sendVerificationEmail.mockResolvedValue({ data: null, error: { message: "boom" } });
    render(<HomeOpenProblem kind="verifyEmail" email="ana@example.test" />);
    fireEvent.click(screen.getByRole("button", { name: "resendVerificationEmail" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("verificationEmailError");
    expect(screen.getByRole("button", { name: "resendVerificationEmail" })).toBeEnabled();
  });

  it("names the owner who has to open ADScale first, and can try again", () => {
    render(<HomeOpenProblem kind="ownerFirst" ownerName="Bia" />);
    expect(screen.getByRole("alert")).toHaveTextContent("homeOwnerFirstNamed:Bia");
    fireEvent.click(screen.getByRole("button", { name: "homeRetry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("without the owner's name keeps the generic owner message", () => {
    render(<HomeOpenProblem kind="ownerFirst" ownerName={null} />);
    expect(screen.getByRole("alert").textContent).toBe("homeOwnerFirst");
  });

  it("any other opening error can be tried again", () => {
    render(<HomeOpenProblem kind="openError" />);
    expect(screen.getByRole("alert")).toHaveTextContent("homeOpenError");
    fireEvent.click(screen.getByRole("button", { name: "homeRetry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

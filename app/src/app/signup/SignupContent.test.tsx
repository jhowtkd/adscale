import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import SignupContent from "./SignupContent";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockSendVerificationEmail = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const msgs = namespace ? (ptBR as Record<string, unknown>)[namespace] || {} : ptBR;
    return (key: string, values?: Record<string, string | number>) => {
      let text = (msgs as Record<string, string>)[key] || key;
      if (values && typeof text === "string") {
        for (const [k, v] of Object.entries(values)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return text;
    };
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    sendVerificationEmail: (...args: unknown[]) => mockSendVerificationEmail(...args),
  },
}));

describe("SignupContent", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockRefresh.mockReset();
    mockSendVerificationEmail.mockReset();
  });

  it("renders the initial signup form with required fields", () => {
    render(<SignupContent />);

    expect(screen.getByLabelText(/nome/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^senha/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /criar conta/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /entrar/i })).toHaveAttribute("href", "/login");
  });

  it("shows consent error when submitted without checking consent", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<SignupContent />);

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: "Password123!" } });

    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você precisa aceitar os Termos de Uso e a Política de Privacidade para continuar.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits valid signup, renders confirmation UX with email, 500 credits trial info, and does not redirect", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<SignupContent />);

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));

    await waitFor(() => {
      expect(screen.getByText(/confirme seu email/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/500 créditos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reenviar/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /entrar/i })).toHaveAttribute("href", "/login");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("resends verification email successfully via authClient and displays accessible feedback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mockSendVerificationEmail.mockResolvedValueOnce({ data: { status: true }, error: null });

    render(<SignupContent />);

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reenviar/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /reenviar/i }));

    await waitFor(() => {
      expect(mockSendVerificationEmail).toHaveBeenCalledWith({
        email: "user@example.com",
        callbackURL: "/",
      });
    });

    const statusFeedback = await screen.findByRole("status");
    expect(statusFeedback).toBeInTheDocument();
  });

  it("handles verification email resend failure with accessible error feedback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mockSendVerificationEmail.mockResolvedValueOnce({
      error: { message: "Muitas tentativas. Tente mais tarde." },
    });

    render(<SignupContent />);

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reenviar/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /reenviar/i }));

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent("Muitas tentativas. Tente mais tarde.");
  });

  it("shows error alert when signup API returns non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "E-mail já cadastrado" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<SignupContent />);

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent("E-mail já cadastrado");
    expect(screen.queryByText(/confirme seu email/i)).not.toBeInTheDocument();
  });

  it("handles resend failure when authClient throws an exception", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    mockSendVerificationEmail.mockRejectedValueOnce(new Error("Falha na conexão"));

    render(<SignupContent />);

    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^senha/i), { target: { value: "Password123!" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reenviar/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /reenviar/i }));

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toHaveTextContent("Falha na conexão");
  });
});

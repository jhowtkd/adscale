import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  RESEND_API_KEY: "re_live_valid_key",
  EMAIL_FROM: "ADScale <onboarding@example.com>",
  APP_URL: "https://app.example.com",
};

vi.mock("@/server/validation/env", () => ({ env }));

const ptCopy = {
  footerFallback: "fallback-pt",
  footerIgnore: "ignore-pt",
  footerSignature: "signature-pt",
  signoffClose: "Abraço,",
  signoffName: "Jhonatan",
  signoffRole: "Founder, ADScale",
  openApp: "Abrir o Estúdio",
  eyebrows: {
    account: "CONTA",
    studio: "ESTÚDIO",
    team: "TIME",
    access: "ACESSO",
    credits: "CRÉDITOS",
  },
  verification: {
    subject: "Falta um clique",
    preview: "preview-pt",
    title: "Quase lá",
    body: "body-pt",
    cta: "Confirmar",
    text: "texto {url}",
  },
  reset: {
    subject: "Redefinir senha",
    preview: "preview-reset",
    title: "Reset",
    body: "body-reset",
    cta: "Nova senha",
    text: "reset {url}",
  },
  waitlist: {
    subject: "Você está na lista",
    preview: "preview-waitlist-pt",
    title: "Você está na lista",
    greeting: "Oi {firstName},",
    greetingAnonymous: "Oi,",
    body: "body-waitlist-pt",
    reason: "reason-waitlist-pt",
    text: "texto waitlist pt",
  },
  welcome: {
    subject: "Entrou. Agora gera.",
    preview: "{credits} créditos no Estúdio",
    title: "O Estúdio tá aberto",
    greeting: "Oi {firstName},",
    greetingAnonymous: "Oi,",
    intro: "Você tem {credits} créditos",
    step1: "Abre o Estúdio",
    step2: "Anexa uma referência",
    step3: "Gera. Revisa. Aprova.",
    close: "Responde este e-mail",
    cta: "Abrir o Estúdio",
    reason: "reason-welcome-pt",
    text: "texto welcome {firstName} {credits} {url}",
  },
};

const enCopy = {
  footerFallback: "fallback-en",
  footerIgnore: "ignore-en",
  footerSignature: "signature-en",
  signoffClose: "Best,",
  signoffName: "Jhonatan",
  signoffRole: "Founder, ADScale",
  eyebrows: {
    account: "ACCOUNT",
    studio: "STUDIO",
    team: "TEAM",
    access: "ACCESS",
    credits: "CREDITS",
  },
  verification: {
    subject: "Verify your ADScale email",
    preview: "preview-en",
    title: "Almost there",
    body: "body-en",
    cta: "Verify",
    text: "verify {url}",
  },
  reset: {
    subject: "Reset password",
    preview: "preview-reset-en",
    title: "Reset",
    body: "body-reset-en",
    cta: "Reset",
    text: "reset {url}",
  },
  waitlist: {
    subject: "You're on the list",
    preview: "preview-waitlist-en",
    title: "You're on the list",
    greeting: "Hi {firstName},",
    greetingAnonymous: "Hi,",
    body: "body-waitlist-en",
    reason: "reason-waitlist-en",
    text: "waitlist text en",
  },
};

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const messages =
      locale === "pt-BR"
        ? { transactionalEmails: ptCopy }
        : { transactionalEmails: enCopy };

    const data = messages[namespace as keyof typeof messages] as Record<string, unknown>;

    return (key: string, values?: Record<string, string>) => {
      const parts = key.split(".");
      let current: unknown = data;
      for (const part of parts) {
        current = (current as Record<string, unknown>)?.[part];
      }
      if (typeof current !== "string") {
        return key;
      }
      return current.replace(/\{(\w+)\}/g, (_, token: string) => values?.[token] ?? `{${token}}`);
    };
  }),
}));

describe("email service", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    vi.resetModules();
  });

  it("sends localized auth email through Resend without exposing the API key in the body", async () => {
    const { sendVerificationEmail } = await import("./email");

    await sendVerificationEmail({
      to: "user@example.com",
      url: "https://app.example.com/api/auth/verify-email?token=abc",
      locale: "pt-BR",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_live_valid_key",
          "Content-Type": "application/json",
        }),
      })
    );

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      from: "ADScale <onboarding@example.com>",
      to: ["user@example.com"],
      subject: "Falta um clique",
    });
    expect(body.html).toContain("https://app.example.com/api/auth/verify-email?token=abc");
    expect(body.html).toContain("https://app.example.com/images/logo-email.png");
    expect(body.html).toContain("CONTA");
    expect(body.html).toContain("#00b34a");
    expect(body.html).toContain("background:#0a0a0a");
    expect(body.html).toContain('data-cta="primary"');
    expect(body.html).toContain("Jhonatan");
    expect(body.html).not.toContain("re_test");
    expect(body.html).not.toContain("cockpit");
  });

  it("sends localized waitlist confirmation email without a CTA button", async () => {
    const { sendWaitlistConfirmationEmail } = await import("./email");

    await sendWaitlistConfirmationEmail({
      to: "waitlist@example.com",
      locale: "pt-BR",
      firstName: "Ana Silva",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_live_valid_key",
          "Content-Type": "application/json",
        }),
      })
    );

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      from: "ADScale <onboarding@example.com>",
      to: ["waitlist@example.com"],
      subject: "Você está na lista",
      text: "texto waitlist pt",
    });
    expect(body.html).toContain("body-waitlist-pt");
    expect(body.html).toContain("Oi Ana,");
    expect(body.html).toContain("reason-waitlist-pt");
    expect(body.html).not.toContain('data-cta="primary"');
    expect(body.html).toContain("#00b34a");
  });

  it("sends welcome email with Studio CTA, credits, and founder signoff", async () => {
    const { sendWelcomeEmail } = await import("./email");

    await sendWelcomeEmail({
      to: "owner@example.com",
      locale: "pt-BR",
      firstName: "Ana Silva",
    });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      from: "ADScale <onboarding@example.com>",
      to: ["owner@example.com"],
      subject: "Entrou. Agora gera.",
    });
    expect(body.text).toContain("500");
    expect(body.text).toContain("https://app.example.com");
    expect(body.html).toContain("Oi Ana,");
    expect(body.html).toContain("500");
    expect(body.html).toContain("Abre o Estúdio");
    expect(body.html).toContain("https://app.example.com");
    expect(body.html).toContain("Abrir o Estúdio");
    expect(body.html).toContain("ESTÚDIO");
    expect(body.html).toContain("Jhonatan");
    expect(body.html).toContain("reason-welcome-pt");
    expect(body.html).toContain('data-cta="primary"');
    expect(body.html).toContain("background:#0a0a0a");
    expect(body.html).toContain("#00b34a");
    expect(body.html).not.toContain("14 dias");
    expect(body.html).not.toContain("cockpit");
  });

  it("raises a useful error when Resend rejects the email", async () => {
    fetchMock.mockResolvedValueOnce(new Response("invalid api key", { status: 401 }));
    const { sendPasswordResetEmail } = await import("./email");

    await expect(
      sendPasswordResetEmail({
        to: "user@example.com",
        url: "https://app.example.com/reset",
        locale: "en",
      })
    ).rejects.toThrow("Resend email failed: 401 invalid api key");
  });
});

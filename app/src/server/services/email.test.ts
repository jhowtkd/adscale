import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  RESEND_API_KEY: "re_live_valid_key",
  EMAIL_FROM: "ADScale <onboarding@example.com>",
  APP_URL: "https://app.example.com",
};

vi.mock("@/server/validation/env", () => ({ env }));

// The first-open welcome is checked against the real copy: its whole point is what the person reads.
import realPt from "../../../messages/pt-BR.json";
import realEn from "../../../messages/en.json";

const ptCopy = {
  footerFallback: "fallback-pt",
  footerIgnore: "ignore-pt",
  footerSignature: "signature-pt",
  signoffClose: "Abraço,",
  signoffName: "Jhonatan",
  signoffRole: "Founder, ADScale",
  openApp: "Abrir o ADScale",
  eyebrows: {
    account: "CONTA",
    studio: "ADSCALE",
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
    greeting: "Oi {firstName},",
    greetingAnonymous: "Oi,",
    reason: "reason-welcome-pt",
  },
  welcomeFirstOpen: realPt.transactionalEmails.welcomeFirstOpen,
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
    studio: "ADSCALE",
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
  welcome: {
    greeting: "Hi {firstName},",
    greetingAnonymous: "Hi,",
    reason: "reason-welcome-en",
  },
  welcomeFirstOpen: realEn.transactionalEmails.welcomeFirstOpen,
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

  describe("welcome email (the one that leads to the first open)", () => {
    const sent = async (locale: string, firstName = "Ana Silva") => {
      const { sendWelcomeEmail } = await import("./email");
      await sendWelcomeEmail({ to: "owner@example.com", locale, firstName });
      return JSON.parse(fetchMock.mock.calls[0][1].body) as { subject: string; text: string; html: string; to: string[] };
    };

    it("leads to the first open in pt-BR: brand reading and a free diagnosis, no Estúdio, no credits", async () => {
      const body = await sent("pt-BR");
      expect(body.to).toEqual(["owner@example.com"]);
      expect(body.subject).toBe("Sua conta no ADScale está pronta");
      expect(body.text).toContain("Oi Ana,");
      expect(body.text).toContain("diagnóstico grátis");
      expect(body.text).toContain("https://app.example.com");
      expect(body.html).toContain("Vamos conhecer a sua marca");
      expect(body.html).toContain("Abrir o ADScale");
      expect(body.html).toContain("https://app.example.com");
      expect(body.html).toContain("Jhonatan");
      expect(body.html).toContain("CONTA");
      expect(body.html).toContain("reason-welcome-pt");
      for (const text of [body.text, body.html, body.subject]) {
        expect(text).not.toMatch(/Estúdio|ESTÚDIO|créditos|500/);
      }
    });

    it("says the same in English", async () => {
      const body = await sent("en", "Ana Silva");
      expect(body.subject).toBe("Your ADScale account is ready");
      expect(body.text).toContain("Hi Ana,");
      expect(body.text).toContain("free diagnosis");
      expect(body.html).toContain("Hi Ana,");
      expect(body.html).toContain("Open ADScale");
      for (const text of [body.text, body.html, body.subject]) {
        expect(text).not.toMatch(/Studio|STUDIO|credits|500/);
      }
    });

    it.each(["pt-BR", "en"])("never mentions Equipe/Team in %s", async (locale) => {
      const body = await sent(locale);
      for (const text of [body.text, body.html, body.subject]) {
        expect(text).not.toMatch(/\bEquipe\b/);
        expect(text).not.toMatch(/\bTeam\b/i);
      }
    });

    it("keeps the subject within the 50-character convention", async () => {
      expect((await sent("pt-BR")).subject.length).toBeLessThanOrEqual(50);
    });

    it("greets an anonymous recipient without a name", async () => {
      const { sendWelcomeEmail } = await import("./email");
      await sendWelcomeEmail({ to: "owner@example.com", locale: "pt-BR", firstName: null });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.html).toContain("Oi,");
    });

    it("falls back to the default locale for an unknown one", async () => {
      const body = await sent("fr");
      expect(body.subject).toBe("Sua conta no ADScale está pronta");
    });
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

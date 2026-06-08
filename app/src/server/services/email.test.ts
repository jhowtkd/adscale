import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  RESEND_API_KEY: "re_live_valid_key",
  EMAIL_FROM: "ADScale <onboarding@example.com>",
  APP_URL: "https://app.example.com",
};

vi.mock("@/server/validation/env", () => ({ env }));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const messages =
      locale === "pt-BR"
        ? {
            transactionalEmails: {
              footerFallback: "fallback-pt",
              footerIgnore: "ignore-pt",
              footerSignature: "signature-pt",
              verification: {
                subject: "Confirme seu e-mail no ADScale",
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
            },
          }
        : {
            transactionalEmails: {
              footerFallback: "fallback-en",
              footerIgnore: "ignore-en",
              footerSignature: "signature-en",
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
            },
          };

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
      subject: "Confirme seu e-mail no ADScale",
    });
    expect(body.html).toContain("https://app.example.com/api/auth/verify-email?token=abc");
    expect(body.html).toContain("#00b34a");
    expect(body.html).not.toContain("re_test");
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = {
  RESEND_API_KEY: "re_test",
  EMAIL_FROM: "ADScale <onboarding@example.com>",
};

vi.mock("@/server/validation/env", () => ({ env }));

describe("email service", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("sends auth email through Resend without exposing the API key in the body", async () => {
    const { sendVerificationEmail } = await import("./email");

    await sendVerificationEmail({
      to: "user@example.com",
      url: "https://app.example.com/api/auth/verify-email?token=abc",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test",
          "Content-Type": "application/json",
        }),
      })
    );

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      from: "ADScale <onboarding@example.com>",
      to: ["user@example.com"],
      subject: "Verify your ADScale email",
    });
    expect(body.html).toContain("https://app.example.com/api/auth/verify-email?token=abc");
    expect(body.html).not.toContain("re_test");
  });

  it("raises a useful error when Resend rejects the email", async () => {
    fetchMock.mockResolvedValueOnce(new Response("invalid api key", { status: 401 }));
    const { sendPasswordResetEmail } = await import("./email");

    await expect(
      sendPasswordResetEmail({
        to: "user@example.com",
        url: "https://app.example.com/reset",
      })
    ).rejects.toThrow("Resend email failed: 401 invalid api key");
  });
});

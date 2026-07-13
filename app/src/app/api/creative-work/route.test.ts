import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

vi.mock("@/server/auth/workspace", () => ({
  requireWorkspaceAccess: vi.fn(() =>
    Promise.resolve({
      user: { id: "user-1" },
      workspace: { id: "workspace-1" },
    })
  ),
}));

const startMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/application/start-social-post-work", () => ({
  startSocialPostWork: (...args: unknown[]) => startMock(...args),
}));

const profileId = "00000000-0000-4000-8000-000000000001";

const validBody = {
  clientProfileId: profileId,
  toolKind: "social_post" as const,
  format: "4:5" as const,
  brief: {
    theme: "Novo produto",
    objective: "Gerar interesse",
    audience: "Empreendedores",
    offer: "Teste gratuito",
  },
};

describe("POST /api/creative-work", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 201 with work + canonical social_post intent", async () => {
    const work = {
      id: "work-1",
      workspaceId: "workspace-1",
      clientProfileId: profileId,
      toolKind: "social_post",
      status: "draft",
      brief: validBody.brief,
      format: "4:5",
    };
    startMock.mockResolvedValue({
      ok: true,
      value: {
        work,
        canonical: {
          id: "creative_work:work-1",
          originKind: "creative_work",
          intent: {
            kind: "social_post",
            objective: "Gerar interesse",
            formatHint: "4:5",
            platforms: [],
          },
        },
      },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.work.id).toBe("work-1");
    expect(body.canonical.intent.kind).toBe("social_post");
    expect(body.canonical.originKind).toBe("creative_work");
    expect(startMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      clientProfileId: profileId,
      format: "4:5",
      brief: validBody.brief,
    });
  });

  it("accepts body without toolKind (preconfigured social_post)", async () => {
    startMock.mockResolvedValue({
      ok: true,
      value: {
        work: { id: "work-2" },
        canonical: {
          id: "creative_work:work-2",
          intent: { kind: "social_post" },
        },
      },
    });

    const { toolKind: _omit, ...withoutToolKind } = validBody;
    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withoutToolKind),
      })
    );
    expect(res.status).toBe(201);
    expect(startMock).toHaveBeenCalled();
  });

  it("returns 404 when profile is outside workspace", async () => {
    startMock.mockResolvedValue({
      ok: false,
      error: { code: "client_profile_not_found" },
    });

    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 when the brief is invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, brief: { theme: "" } }),
      })
    );

    expect(res.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the format is unsupported", async () => {
    const res = await POST(
      new Request("http://localhost/api/creative-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, format: "16:9" }),
      })
    );

    expect(res.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });
});

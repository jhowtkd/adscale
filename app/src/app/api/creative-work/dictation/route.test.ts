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

const processMock = vi.hoisted(() => vi.fn());
const freePlan = vi.hoisted(() => ({ find: vi.fn(async (): Promise<{ accountId: string } | null> => null) }));

vi.mock("@/server/equipe/module/free-plan", () => ({
  findFreePlanAccount: (...args: unknown[]) => (freePlan.find as (...a: unknown[]) => unknown)(...args),
}));

vi.mock("@/server/dictation/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/dictation/service")>();
  return {
    ...original,
    processDictation: (...args: unknown[]) => processMock(...args),
  };
});

function dictationRequest(entries: Record<string, unknown>) {
  const req = new Request("http://localhost/api/creative-work/dictation", { method: "POST" });
  vi.spyOn(req, "formData").mockResolvedValue({
    get: (name: string) => (name in entries ? entries[name] : null),
  } as unknown as FormData);
  return req;
}

function audioFile() {
  return new File([new Uint8Array([1, 2, 3])], "take.webm", { type: "audio/webm" });
}

describe("POST /api/creative-work/dictation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processMock.mockResolvedValue({
      ok: true,
      text: "Crie uma campanha.",
      cleaned: true,
      detectedLanguage: "pt",
      rawLength: 20,
      cleanLength: 18,
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("transcreve e devolve o texto limpo", async () => {
    const res = await POST(
      dictationRequest({ audio: audioFile(), durationSeconds: "12.5" })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      text: "Crie uma campanha.",
      cleaned: true,
      detectedLanguage: "pt",
      rawLength: 20,
      cleanLength: 18,
    });
    expect(processMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      audio: expect.any(File),
      durationSeconds: 12.5,
      workId: undefined,
    });
  });

  it("repassa workId válido", async () => {
    const workId = "123e4567-e89b-12d3-a456-426614174000";
    await POST(dictationRequest({ audio: audioFile(), durationSeconds: "5", workId }));
    expect(processMock).toHaveBeenCalledWith(expect.objectContaining({ workId }));
  });

  it("400 quando workId não é uuid", async () => {
    const res = await POST(
      dictationRequest({ audio: audioFile(), durationSeconds: "5", workId: "nope" })
    );
    expect(res.status).toBe(400);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("400 sem áudio ou duração inválida", async () => {
    const noAudio = await POST(dictationRequest({ durationSeconds: "5" }));
    expect(noAudio.status).toBe(400);
    const badDuration = await POST(
      dictationRequest({ audio: audioFile(), durationSeconds: "zero" })
    );
    expect(badDuration.status).toBe(400);
    expect(processMock).not.toHaveBeenCalled();
  });

  it("429 quando o teto diário estoura", async () => {
    processMock.mockResolvedValue({ ok: false, code: "daily_limit", usedSeconds: 890 });
    const res = await POST(dictationRequest({ audio: audioFile(), durationSeconds: "30" }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("dictationDailyLimit");
  });

  it("502 quando a transcrição falha", async () => {
    processMock.mockResolvedValue({ ok: false, code: "transcription_failed" });
    const res = await POST(dictationRequest({ audio: audioFile(), durationSeconds: "30" }));
    expect(res.status).toBe(502);
  });
});

describe("POST /api/creative-work/dictation on the free plan (ticket 11, part 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
    processMock.mockResolvedValue({
      ok: true, text: "Crie.", cleaned: true, detectedLanguage: "pt", rawLength: 5, cleanLength: 5,
    });
  });
  afterEach(() => {
    freePlan.find.mockReset();
    freePlan.find.mockResolvedValue(null);
    vi.restoreAllMocks();
  });

  it.each([
    ["valid audio", { audio: audioFile(), durationSeconds: "12" }],
    ["no audio and a bad duration", { durationSeconds: "zero" }],
  ])("refuses 402 free_plan before reading the form or transcribing: %s", async (_label, entries) => {
    freePlan.find.mockResolvedValue({ accountId: "acc-free" });
    const req = dictationRequest(entries);

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.code).toBe("free_plan");
    expect(body.details).toEqual(
      expect.objectContaining({ recommendedAction: "plan_request", reason: "free_plan", accountId: "acc-free" })
    );
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(req.formData).not.toHaveBeenCalled();
    expect(processMock).not.toHaveBeenCalled();
  });

  it("consults the rule with the workspace id and transcribes when it is not the free plan", async () => {
    const res = await POST(dictationRequest({ audio: audioFile(), durationSeconds: "12" }));

    expect(res.status).toBe(200);
    expect(freePlan.find).toHaveBeenCalledWith("workspace-1");
    expect(processMock).toHaveBeenCalledTimes(1);
  });
});

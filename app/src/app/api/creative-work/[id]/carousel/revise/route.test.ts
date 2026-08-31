import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAuthError } from "@/server/auth/errors";

const reviseCarouselDeck = vi.hoisted(() => vi.fn());
vi.mock("@/server/application/revise-carousel", () => ({
  reviseCarouselDeck,
  toPublicCarouselSlide: (slide: Record<string, unknown>) => slide,
}));
const requireWorkspaceAccess = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));

import { POST } from "./route";

const params = Promise.resolve({ id: "work-1" });

const request = (body: unknown) =>
  new Request("http://localhost/api/creative-work/work-1/carousel/revise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const REVISION_KEY = "00000000-0000-4000-8000-000000000401";
const DECK_REVISION = "deck-r2";
const plan = {
  version: 1 as const,
  revision: DECK_REVISION,
  workId: "work-1",
  objective: "Divulgar o grupo de terapia",
  audience: null,
  tone: null,
  promise: "Grupo de terapia em agosto",
  format: "4:5" as const,
  slides: [
    {
      slideId: "slide-1", position: 1, role: "hook" as const, purpose: "Abrir",
      primaryText: "Gancho do grupo", secondaryText: null,
      authority: "ai_proposal" as const, sourceFactIds: [], layoutFamily: "impact" as const,
    },
    {
      slideId: "slide-2", position: 2, role: "closing" as const, purpose: "Fechar",
      primaryText: "Fechamento do grupo", secondaryText: null,
      authority: "ai_proposal" as const, sourceFactIds: [], layoutFamily: "respite" as const,
    },
    {
      slideId: "slide-3", position: 3, role: "context" as const, purpose: "Contexto",
      primaryText: "Contexto do grupo", secondaryText: null,
      authority: "ai_proposal" as const, sourceFactIds: [], layoutFamily: "development" as const,
    },
    {
      slideId: "slide-4", position: 4, role: "problem" as const, purpose: "Problema",
      primaryText: "Problema do grupo", secondaryText: null,
      authority: "ai_proposal" as const, sourceFactIds: [], layoutFamily: "impact" as const,
    },
    {
      slideId: "slide-5", position: 5, role: "argument" as const, purpose: "Argumento",
      primaryText: "Argumento do grupo", secondaryText: null,
      authority: "ai_proposal" as const, sourceFactIds: [], layoutFamily: "development" as const,
    },
  ],
};

const body = {
  expectedRevision: "deck-r1",
  revisionKey: REVISION_KEY,
  plan,
  globalVisualInstruction: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceAccess.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "ws-1" } });
  reviseCarouselDeck.mockResolvedValue({
    ok: true,
    value: {
      work: { id: "work-1", status: "generating" },
      slides: [{ id: "slide-1-v2", position: 1, status: "draft", hasOutput: false }],
      deckRevision: `deck-${REVISION_KEY}`,
      replay: false,
    },
  });
});

describe("POST /api/creative-work/[id]/carousel/revise", () => {
  it("owns the deck reorder body and passes it strictly to the workspace-scoped command", async () => {
    const response = await POST(request(body), { params });

    expect(response.status).toBe(200);
    expect(reviseCarouselDeck).toHaveBeenCalledTimes(1);
    expect(reviseCarouselDeck).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workItemId: "work-1",
      userId: "user-1",
      expectedRevision: "deck-r1",
      revisionKey: REVISION_KEY,
      plan,
      globalVisualInstruction: null,
    });
    const payload = await response.json();
    expect(payload.deckRevision).toBe(`deck-${REVISION_KEY}`);
    expect(JSON.stringify(payload)).not.toMatch(/outputKey|providerBaseKey|previewKey|anchorKey|generationOperationKey/);
  });

  it("accepts a trimmed global visual instruction on the same route", async () => {
    const response = await POST(request({ ...body, globalVisualInstruction: "Sem retratos humanos" }), { params });

    expect(response.status).toBe(200);
    expect(reviseCarouselDeck).toHaveBeenCalledWith(expect.objectContaining({ globalVisualInstruction: "Sem retratos humanos" }));
  });

  it("rejects bodies outside the strict schema before any command runs", async () => {
    const missingPlan = await POST(request({ expectedRevision: "deck-r1", revisionKey: REVISION_KEY, globalVisualInstruction: null }), { params });
    expect(missingPlan.status).toBe(400);

    const extraField = await POST(request({ ...body, campaignId: "campaign-1" }), { params });
    expect(extraField.status).toBe(400);

    const blankInstruction = await POST(request({ ...body, globalVisualInstruction: "   " }), { params });
    expect(blankInstruction.status).toBe(400);

    expect(reviseCarouselDeck).not.toHaveBeenCalled();
  });

  it("isolates the command behind workspace authentication", async () => {
    requireWorkspaceAccess.mockRejectedValue(new WorkspaceAuthError("no_workspace", "no workspace"));
    const response = await POST(request(body), { params });

    expect(response.status).toBe(403);
    expect(reviseCarouselDeck).not.toHaveBeenCalled();
  });

  it.each([
    ["work_not_found", 404],
    ["work_not_carousel", 409],
    ["stale_input", 409],
    ["revision_conflict", 409],
    ["generation_in_flight", 409],
    ["invalid_plan", 422],
    ["invalid_context", 422],
    ["dispatch_failed", 502],
  ])("maps %s to %i", async (code, status) => {
    reviseCarouselDeck.mockResolvedValue({ ok: false, error: { code } });
    const response = await POST(request(body), { params });
    expect(response.status).toBe(status);
  });
});

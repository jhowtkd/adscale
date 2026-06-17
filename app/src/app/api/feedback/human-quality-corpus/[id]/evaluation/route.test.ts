import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/server/auth/platform-owner", () => ({
  requirePlatformOwner: vi.fn(),
}));

vi.mock("@/server/human-quality/service", () => ({
  HumanQualityServiceError: class HumanQualityServiceError extends Error {
    constructor(
      message: string,
      public code: string
    ) {
      super(message);
      this.name = "HumanQualityServiceError";
    }
  },
  submitHumanEvaluation: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
}));

import { requirePlatformOwner } from "@/server/auth/platform-owner";
import {
  HumanQualityServiceError,
  submitHumanEvaluation,
} from "@/server/human-quality/service";

const WORKSPACE_ID = "550e8400-e29b-41d4-a716-446655440002";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockRequireOwner = vi.mocked(requirePlatformOwner);
const mockSubmit = vi.mocked(submitHumanEvaluation);

const validEvaluationBody = {
  workspaceId: WORKSPACE_ID,
  visualScore: 82,
  factualPass: true,
  intent: "approve",
  primaryFailureReason: "other",
  notes: "Looks good overall",
};

describe("POST /api/feedback/human-quality-corpus/[id]/evaluation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwner.mockResolvedValue({
      user: { id: "reviewer-1", email: "owner@test.com" },
    });
  });

  it("submits structured human evaluation for platform owner", async () => {
    mockSubmit.mockResolvedValue({
      item: { id: ITEM_ID, status: "evaluated" },
      evaluation: {
        id: "eval-1",
        visualScore: 82,
        factualPass: true,
        intent: "approve",
        primaryFailureReason: "other",
      },
    } as never);

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validEvaluationBody,
            intent: "approve",
          }),
        }
      ),
      { params: Promise.resolve({ id: ITEM_ID }) }
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.evaluation.visualScore).toBe(82);
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        corpusItemId: ITEM_ID,
        reviewerUserId: "reviewer-1",
        visualScore: 82,
        intent: "approve",
      })
    );
  });

  it("returns 403 when not platform owner", async () => {
    const { WorkspaceAuthError, AUTH_ERROR_CODES } = await import("@/server/auth/errors");
    mockRequireOwner.mockRejectedValue(
      new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validEvaluationBody),
        }
      ),
      { params: Promise.resolve({ id: ITEM_ID }) }
    );

    expect(res.status).toBe(403);
  });

  it("rejects invalid evaluation payloads", async () => {
    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId: WORKSPACE_ID,
            visualScore: 150,
            factualPass: true,
            intent: "approve",
            primaryFailureReason: "other",
          }),
        }
      ),
      { params: Promise.resolve({ id: ITEM_ID }) }
    );

    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("rejects insufficient evaluation fields", async () => {
    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: WORKSPACE_ID }),
        }
      ),
      { params: Promise.resolve({ id: ITEM_ID }) }
    );

    expect(res.status).toBe(400);
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("returns 404 when corpus item not found in workspace", async () => {
    mockSubmit.mockRejectedValue(
      new HumanQualityServiceError("Corpus item not found", "corpus_item_not_found")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validEvaluationBody,
            intent: "approve",
          }),
        }
      ),
      { params: Promise.resolve({ id: ITEM_ID }) }
    );

    expect(res.status).toBe(404);
  });

  it("returns 409 when corpus item is not pending", async () => {
    mockSubmit.mockRejectedValue(
      new HumanQualityServiceError(
        "Corpus item is not pending evaluation",
        "corpus_item_not_pending"
      )
    );

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...validEvaluationBody,
            intent: "reject",
            primaryFailureReason: "weak_hierarchy",
          }),
        }
      ),
      { params: Promise.resolve({ id: ITEM_ID }) }
    );

    expect(res.status).toBe(409);
  });

  it("returns 400 when service rejects invalid evaluation fields", async () => {
    mockSubmit.mockRejectedValue(
      new HumanQualityServiceError("visualScore must be between 0 and 100", "validation_error")
    );

    const res = await POST(
      new Request(
        `http://localhost/api/feedback/human-quality-corpus/${ITEM_ID}/evaluation`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId: WORKSPACE_ID,
            visualScore: 50,
            factualPass: false,
            intent: "reject",
            primaryFailureReason: "weak_hierarchy",
          }),
        }
      ),
      { params: Promise.resolve({ id: ITEM_ID }) }
    );

    expect(res.status).toBe(400);
  });
});

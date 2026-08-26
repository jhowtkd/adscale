import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockRedeemBetaAccess = vi.fn();
const mockGetWorkspaceForUser = vi.fn();

const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/server/billing/beta", () => ({
  redeemBetaAccess: (...args: unknown[]) => mockRedeemBetaAccess(...args),
}));

vi.mock("@/server/repositories/workspace", () => ({
  getWorkspaceForUser: (...args: unknown[]) => mockGetWorkspaceForUser(...args),
}));

import { GET, POST } from "./route";

describe("GET and POST /api/user/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  describe("GET /api/user/onboarding", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const req = new Request("http://localhost/api/user/onboarding", { method: "GET" });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json).toEqual({ error: "Unauthorized" });
    });

    it("returns completed false when onboardingCompletedAt is null", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
      mockLimit.mockResolvedValue([{ onboardingCompletedAt: null }]);

      const req = new Request("http://localhost/api/user/onboarding", { method: "GET" });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ completed: false });
    });

    it("returns completed true when onboardingCompletedAt is set", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "u-1" } });
      mockLimit.mockResolvedValue([{ onboardingCompletedAt: new Date() }]);

      const req = new Request("http://localhost/api/user/onboarding", { method: "GET" });
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ completed: true });
    });
  });

  describe("POST /api/user/onboarding", () => {
    it("returns 401 when user is not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const req = new Request("http://localhost/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json).toEqual({ error: "Unauthorized" });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("updates onboardingCompletedAt and returns success", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "u-1" } });

      const req = new Request("http://localhost/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ onboardingCompletedAt: expect.any(Date) })
      );
    });

    it("ignores legacy betaCode in body and does not invoke beta redemption", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "u-1" } });

      const req = new Request("http://localhost/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betaCode: "LEGACY-BETA-CODE" }),
      });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockRedeemBetaAccess).not.toHaveBeenCalled();
      expect(mockGetWorkspaceForUser).not.toHaveBeenCalled();
    });
  });
});

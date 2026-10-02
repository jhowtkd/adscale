// The platform inbox probe against every combination of guard outcome and query string (ticket 13, D-11). Only `access=1` is the probe; every other query keeps
// the old contract (403 for a person who may not open the inbox). The probe answers with exactly {allowed} and never reads a report.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";

vi.mock("@/server/auth/require-platform-owner", () => ({ requirePlatformOwner: vi.fn() }));
vi.mock("@/server/auth/workspace", () => ({ requireWorkspaceAccess: vi.fn() }));
vi.mock("@/server/repositories/feedback", () => ({ createFeedbackReport: vi.fn(), listFeedbackReports: vi.fn(async () => [{ id: "report-secret" }]) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(() => Promise.resolve((key: string) => key)) }));

import { requirePlatformOwner } from "@/server/auth/require-platform-owner";
import { listFeedbackReports } from "@/server/repositories/feedback";
import { GET } from "./route";

const guard = vi.mocked(requirePlatformOwner);
type Outcome = "owner" | "no_session" | "no_permission" | "unexpected";
const OUTCOMES: Record<Outcome, () => void> = {
  owner: () => guard.mockResolvedValue({ user: { email: "owner@test.com" } } as never),
  no_session: () => guard.mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")),
  no_permission: () => guard.mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")),
  unexpected: () => guard.mockRejectedValue(new Error("session store down")),
};
// [query string, is it the probe?]
const QUERIES: Array<[string, boolean]> = [["?access=1", true], ["?access=0", false], ["?access=true", false], ["?access=", false], ["", false], ["?access=1&access=0", true], ["?access=0&access=1", false],
  ["?ACCESS=1", false], ["?Access=1", false], ["?access=1%20", false], ["?access=01", false], ["?access=1.0", false], ["?access=%31", true], ["?xaccess=1", false], ["?access[]=1", false], ["?access=1&status=open", true]];

describe("GET /api/feedback/reports: guard outcome × query", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [query, isProbe] of QUERIES) for (const outcome of Object.keys(OUTCOMES) as Outcome[]) {
    it(`${outcome}, "${query}" ${isProbe ? "(the probe)" : "(the inbox)"}`, async () => {
      OUTCOMES[outcome]();
      const res = await GET(new Request(`http://localhost/api/feedback/reports${query}`));
      const body: unknown = await res.json().catch(() => null);
      const expected = outcome === "no_session" ? 401 : outcome === "unexpected" ? 500 : outcome === "no_permission" ? (isProbe ? 200 : 403) : 200;
      expect(res.status).toBe(expected);
      if (isProbe && (outcome === "owner" || outcome === "no_permission")) {
        // The probe's body is exactly {allowed}: nothing of the inbox rides along.
        expect(Object.keys(body as object)).toEqual(["allowed"]);
        expect((body as { allowed: unknown }).allowed).toBe(outcome === "owner");
        expect(listFeedbackReports).not.toHaveBeenCalled();
      }
      if (!isProbe && outcome === "owner") { expect(body).toEqual({ reports: [{ id: "report-secret" }] }); expect(listFeedbackReports).toHaveBeenCalledTimes(1); }
      if (outcome !== "owner") expect(listFeedbackReports).not.toHaveBeenCalled();
      // A person who may not open the inbox never sees a report, whatever the query says.
      if (outcome !== "owner") expect(JSON.stringify(body)).not.toContain("report-secret");
      // A refusal to someone who may not is a 403 on the inbox and a plain "no" only on the probe.
      expect(guard).toHaveBeenCalledTimes(1);
    });
  }
});

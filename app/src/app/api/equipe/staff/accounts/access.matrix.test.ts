// The staff probe against every combination of guard outcome and query string (ticket 13, D-11). Only `access=1` is the probe; every other query keeps the old
// contract. The probe answers with exactly {allowed} and never reads the pipeline, the account list or the global stop.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES, WorkspaceAuthError } from "@/server/auth/errors";

vi.mock("@/server/equipe/http/guards", () => ({ equipeStaffContext: vi.fn() }));
vi.mock("@/server/equipe/module/escalation-queries", () => ({ getCrossAccountPipeline: vi.fn(async () => ({ pipeline: ["account-secret"] })) }));
vi.mock("@/server/equipe/module/global-stop", () => ({ getGlobalStopState: vi.fn(async () => ({ stopped: false })) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(() => Promise.resolve((key: string) => key)) }));

import { equipeStaffContext } from "@/server/equipe/http/guards";
import { getCrossAccountPipeline } from "@/server/equipe/module/escalation-queries";
import { getGlobalStopState } from "@/server/equipe/module/global-stop";
import { GET } from "./route";

const guard = vi.mocked(equipeStaffContext);
type Outcome = "staff" | "no_session" | "no_permission" | "unexpected";
const OUTCOMES: Record<Outcome, () => void> = {
  staff: () => guard.mockResolvedValue({ user: { id: "u" }, deps: { uow: { repos: {}, internal: {} } }, staffRows: [] } as never),
  no_session: () => guard.mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.unauthorized, "Unauthorized")),
  no_permission: () => guard.mockRejectedValue(new WorkspaceAuthError(AUTH_ERROR_CODES.forbidden, "Forbidden")),
  unexpected: () => guard.mockRejectedValue(new Error("db down")),
};
const QUERIES: Array<[string, boolean]> = [["?access=1", true], ["?access=0", false], ["?access=true", false], ["?access=", false], ["", false], ["?access=1&access=0", true], ["?access=0&access=1", false],
  ["?ACCESS=1", false], ["?Access=1", false], ["?access=1%20", false], ["?access=01", false], ["?access=1.0", false], ["?access=%31", true], ["?xaccess=1", false], ["?access[]=1", false]];

describe("GET /api/equipe/staff/accounts: guard outcome × query", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [query, isProbe] of QUERIES) for (const outcome of Object.keys(OUTCOMES) as Outcome[]) {
    it(`${outcome}, "${query}" ${isProbe ? "(the probe)" : "(the pipeline)"}`, async () => {
      OUTCOMES[outcome]();
      const res = await GET(new Request(`http://localhost/api/equipe/staff/accounts${query}`));
      const body: unknown = await res.json().catch(() => null);
      const expected = outcome === "no_session" ? 401 : outcome === "unexpected" ? 500 : outcome === "no_permission" ? (isProbe ? 200 : 403) : 200;
      expect(res.status).toBe(expected);
      if (isProbe && (outcome === "staff" || outcome === "no_permission")) {
        expect(Object.keys(body as object)).toEqual(["allowed"]);
        expect((body as { allowed: unknown }).allowed).toBe(outcome === "staff");
      }
      if (isProbe) {
        // The probe reads nothing: no pipeline, no global stop.
        expect(getCrossAccountPipeline).not.toHaveBeenCalled();
        expect(getGlobalStopState).not.toHaveBeenCalled();
      } else if (outcome === "staff") {
        expect(body).toEqual({ pipeline: ["account-secret"], globalStop: { stopped: false } });
        expect(getCrossAccountPipeline).toHaveBeenCalledTimes(1);
        expect(getGlobalStopState).toHaveBeenCalledTimes(1);
      } else {
        expect(getCrossAccountPipeline).not.toHaveBeenCalled();
      }
      if (outcome !== "staff") expect(JSON.stringify(body)).not.toContain("account-secret");
      expect(guard).toHaveBeenCalledTimes(1);
    });
  }
});

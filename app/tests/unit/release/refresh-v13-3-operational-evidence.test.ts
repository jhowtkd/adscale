import { describe, expect, it } from "vitest";
import {
  buildOperationalRefreshPatch,
  loadRefreshInputFromManifest,
  resolveOperationalEvidenceStatus,
} from "../../../scripts/refresh-v13-3-operational-evidence";

describe("refresh-v13-3-operational-evidence", () => {
  it("lifts fixtureOnly when manifest has 5 real_customer rows", () => {
    const input = loadRefreshInputFromManifest({
      schemaVersion: 1,
      targetWorkspace: { id: "ws-1", name: "Workspace" },
      targetProfile: { id: "profile-1", name: "Outra Marca", fixtureSeed: false },
      itemCount: 5,
      campaigns: Array.from({ length: 5 }, () => ({ sourceLabel: "real_customer" })),
    });

    expect(input.fixtureOnly).toBe(false);
    expect(input.sourceComposition.real_customer).toBe(5);
    expect(input.operationalStatus).toBe("ok");
    expect(input.claimsAllowed).toContain("validated_against_customer_real");
  });

  it("keeps fixtureOnly and blocks customer-real claims with zero real_customer", () => {
    const input = loadRefreshInputFromManifest({
      schemaVersion: 1,
      targetWorkspace: { id: "ws-1", name: "Workspace" },
      targetProfile: { id: "profile-1", name: "Cenbrap" },
      itemCount: 0,
      campaigns: [],
    });

    expect(input.fixtureOnly).toBe(true);
    expect(input.claimsBlocked).toContain("validated_against_customer_real");
    expect(resolveOperationalEvidenceStatus(input)).toBe("insufficient_sample");
  });

  it("marks operational evidence ok when sample and smoke pass", () => {
    const patch = buildOperationalRefreshPatch({
      workspaceId: "ws-1",
      clientProfileId: "profile-1",
      evaluatedItemCount: 5,
      sourceComposition: {
        synthetic_fixture: 0,
        operator_imported: 0,
        real_customer: 5,
      },
      fixtureOnly: false,
      claimsAllowed: ["global_corpus_evaluations_recorded", "validated_against_customer_real"],
      claimsBlocked: [],
      operationalStatus: "ok",
      smoke: {
        factualAlerts: { status: "pass" },
        evidenceLinks: { status: "pass" },
        proposalSeparation: { status: "pass" },
        settingsPersistence: { status: "pass" },
      },
    });

    expect(patch.status).toBe("ok");
    const gates = patch.gates as Record<string, { status: string }>;
    expect(gates.factualAlerts.status).toBe("pass");
    expect(gates.settingsPersistence.status).toBe("pass");
  });
});

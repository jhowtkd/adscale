import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SEED_MARKERS,
  isFixtureCampaign,
  isDemoWorkspace,
  isDemoUser,
  filterFixtureCampaigns,
  shouldAllowFixtures,
  demoWorkspaceSlug,
  demoUserEmail,
  type CampaignLike,
} from "./demo-gating";

const baseCampaign: CampaignLike = {
  id: "camp-1",
  name: "Cenbrap em Dobro",
  notes: null,
  constraints: null,
};

describe("demoWorkspaceSlug / demoUserEmail env readers", () => {
  const originalSlug = process.env.DEMO_WORKSPACE_SLUG;
  const originalEmail = process.env.DEMO_USER_EMAIL;

  beforeEach(() => {
    delete process.env.DEMO_WORKSPACE_SLUG;
    delete process.env.DEMO_USER_EMAIL;
  });

  afterEach(() => {
    if (originalSlug === undefined) delete process.env.DEMO_WORKSPACE_SLUG;
    else process.env.DEMO_WORKSPACE_SLUG = originalSlug;
    if (originalEmail === undefined) delete process.env.DEMO_USER_EMAIL;
    else process.env.DEMO_USER_EMAIL = originalEmail;
  });

  it("returns null when env is unset", () => {
    expect(demoWorkspaceSlug()).toBeNull();
    expect(demoUserEmail()).toBeNull();
  });

  it("returns the trimmed slug/email when env is set", () => {
    process.env.DEMO_WORKSPACE_SLUG = "  adscale-demo  ";
    process.env.DEMO_USER_EMAIL = "  Demo@ADScale.Local  ";
    expect(demoWorkspaceSlug()).toBe("adscale-demo");
    expect(demoUserEmail()).toBe("demo@adscale.local");
  });

  it("treats whitespace-only env as unset", () => {
    process.env.DEMO_WORKSPACE_SLUG = "   ";
    process.env.DEMO_USER_EMAIL = "   ";
    expect(demoWorkspaceSlug()).toBeNull();
    expect(demoUserEmail()).toBeNull();
  });
});

describe("isDemoWorkspace", () => {
  beforeEach(() => {
    process.env.DEMO_WORKSPACE_SLUG = "adscale-demo";
  });

  afterEach(() => {
    delete process.env.DEMO_WORKSPACE_SLUG;
  });

  it("matches the demo slug case-insensitively", () => {
    expect(isDemoWorkspace({ id: "w1", name: "Demo", slug: "ADScale-Demo" })).toBe(true);
    expect(isDemoWorkspace({ id: "w1", name: "Demo", slug: "adscale-demo" })).toBe(true);
  });

  it("rejects a non-demo workspace", () => {
    expect(isDemoWorkspace({ id: "w2", name: "Jhonatan", slug: "jhonatan-real" })).toBe(false);
  });

  it("returns false when env is unset", () => {
    delete process.env.DEMO_WORKSPACE_SLUG;
    expect(isDemoWorkspace({ id: "w1", name: "Demo", slug: "adscale-demo" })).toBe(false);
  });

  it("returns false for null/undefined input", () => {
    expect(isDemoWorkspace(null)).toBe(false);
    expect(isDemoWorkspace(undefined)).toBe(false);
  });
});

describe("isDemoUser", () => {
  beforeEach(() => {
    process.env.DEMO_USER_EMAIL = "demo@adscale.local";
  });

  afterEach(() => {
    delete process.env.DEMO_USER_EMAIL;
  });

  it("matches the demo email case-insensitively", () => {
    expect(isDemoUser({ email: "Demo@ADScale.local" })).toBe(true);
    expect(isDemoUser({ email: "demo@adscale.local" })).toBe(true);
  });

  it("rejects a non-demo user", () => {
    expect(isDemoUser({ email: "jhonatan@example.com" })).toBe(false);
  });

  it("returns false when env is unset", () => {
    delete process.env.DEMO_USER_EMAIL;
    expect(isDemoUser({ email: "demo@adscale.local" })).toBe(false);
  });

  it("returns false for null/undefined input", () => {
    expect(isDemoUser(null)).toBe(false);
    expect(isDemoUser(undefined)).toBe(false);
  });
});

describe("isFixtureCampaign", () => {
  it("detects the phase144 seed marker in notes", () => {
    expect(
      isFixtureCampaign({
        ...baseCampaign,
        notes: "phase144_cenbrap_calibration_corpus",
      })
    ).toBe(true);
  });

  it("detects the phase173 seed marker in notes", () => {
    expect(
      isFixtureCampaign({
        ...baseCampaign,
        notes: "phase173_live_real_customer_corpus",
      })
    ).toBe(true);
  });

  it("detects the seed_marker=... pattern in constraints", () => {
    expect(
      isFixtureCampaign({
        ...baseCampaign,
        constraints: "seed_marker=phase144_cenbrap_calibration_corpus; source=synthetic_fixture",
      })
    ).toBe(true);
  });

  it("detects source=synthetic_fixture in constraints", () => {
    expect(
      isFixtureCampaign({
        ...baseCampaign,
        constraints: "some note; source=synthetic_fixture",
      })
    ).toBe(true);
  });

  it("does NOT flag a real user-created campaign", () => {
    expect(
      isFixtureCampaign({
        ...baseCampaign,
        notes: "Briefing inicial feito pelo Jhonatan",
        constraints: "tom=institucional",
      })
    ).toBe(false);
  });

  it("does NOT flag an empty/null marker", () => {
    expect(isFixtureCampaign({ ...baseCampaign })).toBe(false);
    expect(
      isFixtureCampaign({ ...baseCampaign, notes: null, constraints: null })
    ).toBe(false);
  });

  it("covers every marker in SEED_MARKERS", () => {
    for (const marker of SEED_MARKERS) {
      expect(
        isFixtureCampaign({ ...baseCampaign, notes: marker })
      ).toBe(true);
    }
  });
});

describe("filterFixtureCampaigns", () => {
  const realCampaign: CampaignLike = {
    id: "real-1",
    name: "Cenbrap em Dobro",
    notes: "Briefing inicial",
    constraints: null,
  };
  const fixtureCampaign: CampaignLike = {
    id: "fix-1",
    name: "Cenbrap Calibration — NR1 Gestalt",
    notes: "phase144_cenbrap_calibration_corpus",
    constraints: "seed_marker=phase144_cenbrap_calibration_corpus; source=synthetic_fixture",
  };
  const realWithoutMarkers: CampaignLike = {
    id: "real-2",
    name: "Teste",
    notes: null,
    constraints: null,
  };

  it("passes everything through when allowFixtures is true", () => {
    const campaigns = [realCampaign, fixtureCampaign, realWithoutMarkers];
    expect(
      filterFixtureCampaigns(campaigns, { allowFixtures: true })
    ).toEqual(campaigns);
  });

  it("drops only fixture-marked campaigns when allowFixtures is false", () => {
    const campaigns = [realCampaign, fixtureCampaign, realWithoutMarkers];
    expect(
      filterFixtureCampaigns(campaigns, { allowFixtures: false })
    ).toEqual([realCampaign, realWithoutMarkers]);
  });

  it("preserves order of the surviving campaigns", () => {
    const campaigns = [fixtureCampaign, realCampaign, fixtureCampaign, realWithoutMarkers];
    expect(
      filterFixtureCampaigns(campaigns, { allowFixtures: false })
    ).toEqual([realCampaign, realWithoutMarkers]);
  });

  it("returns an empty array when all campaigns are fixtures and allowFixtures is false", () => {
    expect(
      filterFixtureCampaigns([fixtureCampaign], { allowFixtures: false })
    ).toEqual([]);
  });

  it("returns an empty array for an empty input regardless of flag", () => {
    expect(filterFixtureCampaigns([], { allowFixtures: true })).toEqual([]);
    expect(filterFixtureCampaigns([], { allowFixtures: false })).toEqual([]);
  });
});

describe("shouldAllowFixtures", () => {
  beforeEach(() => {
    process.env.DEMO_WORKSPACE_SLUG = "adscale-demo";
    process.env.DEMO_USER_EMAIL = "demo@adscale.local";
  });

  afterEach(() => {
    delete process.env.DEMO_WORKSPACE_SLUG;
    delete process.env.DEMO_USER_EMAIL;
  });

  it("allows fixtures when the workspace is the demo workspace", () => {
    expect(
      shouldAllowFixtures({ id: "w1", name: "Demo", slug: "adscale-demo" }, { email: "someone-else@x.com" })
    ).toBe(true);
  });

  it("allows fixtures when the user is the demo user (even on a non-demo workspace)", () => {
    expect(
      shouldAllowFixtures({ id: "w2", name: "Real", slug: "real" }, { email: "demo@adscale.local" })
    ).toBe(true);
  });

  it("blocks fixtures for a real workspace + real user", () => {
    expect(
      shouldAllowFixtures({ id: "w2", name: "Real", slug: "real" }, { email: "jhonatan@example.com" })
    ).toBe(false);
  });

  it("blocks fixtures when both env vars are unset", () => {
    delete process.env.DEMO_WORKSPACE_SLUG;
    delete process.env.DEMO_USER_EMAIL;
    expect(
      shouldAllowFixtures({ id: "w1", name: "Real", slug: "real" }, { email: "jhonatan@example.com" })
    ).toBe(false);
  });
});

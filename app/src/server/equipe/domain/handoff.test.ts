import { describe, expect, it } from "vitest";
import {
  HANDOFF_MAX_NETWORKS,
  allGroupsFinished,
  defaultNetworkSelection,
  hasUnmanagedKeptImages,
  identityReady,
  isGroupFinished,
  transitionHandoff,
  type HandoffDecisions,
  type HandoffItem,
  type HandoffReading,
  type HandoffState,
} from "./handoff";

const item = (id: string): HandoffItem => ({ id, value: id, origin: "site" });

function state(overrides: Partial<HandoffState> = {}): HandoffState {
  return {
    step: "source",
    version: 1,
    source: null,
    readingId: null,
    readsUsed: 0,
    reading: {},
    captured: {},
    decisions: {},
    ...overrides,
  };
}

const runningReading = (status: "pending" | "running" | "found" | "not_found" | "failed"): HandoffReading[string] => ({
  runId: "run-1",
  taskIntentId: "task-1",
  status,
});

const identityFinishedReading: HandoffReading = {
  name: runningReading("found"),
  logo: runningReading("not_found"),
  colors: runningReading("found"),
  fonts: runningReading("failed"),
};

const allGroupsFinishedReading: HandoffReading = {
  ...identityFinishedReading,
  networks: runningReading("found"),
  images: runningReading("not_found"),
};

/** A successful public reading that simply didn't find a name — releases identity for manual entry. */
const nameNotFoundReading: HandoffReading = {
  name: runningReading("not_found"),
  logo: runningReading("not_found"),
  colors: runningReading("found"),
  fonts: runningReading("found"),
};

const fullDecisions: HandoffDecisions = {
  identity: { name: item("name"), logo: null, colors: [], fonts: [], paletteChoice: "site" },
  networks: [item("insta")],
  images: { kept: [], removed: [], uploaded: [] },
};

describe("isGroupFinished / identityReady / allGroupsFinished", () => {
  it("treats found, not_found and failed as finished, but not pending or running", () => {
    expect(isGroupFinished("found")).toBe(true);
    expect(isGroupFinished("not_found")).toBe(true);
    expect(isGroupFinished("failed")).toBe(true);
    expect(isGroupFinished("pending")).toBe(false);
    expect(isGroupFinished("running")).toBe(false);
    expect(isGroupFinished(undefined)).toBe(false);
  });

  it("releases identity once every group is finished, EVEN when the name itself was not found (the person types it manually)", () => {
    expect(identityReady(state({ reading: identityFinishedReading }))).toBe(true);
    expect(identityReady(state({ reading: { ...identityFinishedReading, name: runningReading("not_found") } }))).toBe(true);
  });

  it("still blocks identity when the name group's own reading FAILED (unlike not_found, a real failure)", () => {
    expect(identityReady(state({ reading: { ...identityFinishedReading, name: runningReading("failed") } }))).toBe(false);
  });

  it("blocks identity while any of the four groups is still pending or running", () => {
    expect(identityReady(state({ reading: { ...identityFinishedReading, colors: runningReading("running") } }))).toBe(false);
    expect(identityReady(state({ reading: { ...identityFinishedReading, logo: runningReading("pending") } }))).toBe(false);
  });

  it("requires every group to be finished for allGroupsFinished", () => {
    expect(allGroupsFinished(state({ reading: allGroupsFinishedReading }))).toBe(true);
    expect(allGroupsFinished(state({ reading: identityFinishedReading }))).toBe(false);
  });
});

describe("transitionHandoff: source -> reading", () => {
  it("moves from source to reading and bumps the version", () => {
    const result = transitionHandoff(state({ step: "source", version: 1 }), "source");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("reading");
    expect(result.value.version).toBe(2);
  });

  it("refuses to set a source once the handoff is done", () => {
    const result = transitionHandoff(state({ step: "done", version: 5 }), "source");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_transition");
  });
});

describe("transitionHandoff: progress (reading -> identity, step 3 early release)", () => {
  it("moves reading to identity as soon as name/logo/colors/fonts are finished, without waiting on networks/images", () => {
    const result = transitionHandoff(state({ step: "reading", version: 2, reading: identityFinishedReading }), "progress");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("identity");
  });

  it("bumps the version on the step transition triggered by progress", () => {
    const result = transitionHandoff(state({ step: "reading", version: 2, reading: identityFinishedReading }), "progress");
    if (!result.ok) throw new Error("setup failed");
    expect(result.value.version).toBe(3);
  });

  it("does not advance, and does not bump version, while identity groups are still pending", () => {
    const reading: HandoffReading = { ...identityFinishedReading, colors: runningReading("running") };
    const result = transitionHandoff(state({ step: "reading", version: 2, reading }), "progress");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("reading");
    expect(result.value.version).toBe(2);
  });

  it("is a no-op outside the reading step", () => {
    const result = transitionHandoff(state({ step: "identity", version: 3, reading: identityFinishedReading }), "progress");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("identity");
    expect(result.value.version).toBe(3);
  });

  it("also releases identity when a successful public reading simply found no name (typed manually, origin user)", () => {
    const result = transitionHandoff(state({ step: "reading", version: 2, reading: nameNotFoundReading }), "progress");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("identity");
  });

  it("does NOT release identity when the name group's reading itself failed", () => {
    const reading: HandoffReading = { ...nameNotFoundReading, name: runningReading("failed") };
    const result = transitionHandoff(state({ step: "reading", version: 2, reading }), "progress");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("reading");
  });
});

describe("transitionHandoff: identity -> networks", () => {
  it("advances once identity is ready", () => {
    const result = transitionHandoff(state({ step: "identity", version: 3, reading: identityFinishedReading }), "identity");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("networks");
    expect(result.value.version).toBe(4);
  });

  it("rejects when not on the identity step", () => {
    const result = transitionHandoff(state({ step: "reading", version: 2, reading: identityFinishedReading }), "identity");
    expect(result.ok).toBe(false);
  });

  it("rejects when identity groups are not all finished", () => {
    const result = transitionHandoff(state({ step: "identity", version: 3, reading: { name: runningReading("found") } }), "identity");
    expect(result.ok).toBe(false);
  });

  it("outside a revision (no decisions.revising), always goes through networks, even if networks/images decisions already exist", () => {
    const result = transitionHandoff(state({
      step: "identity", version: 3, reading: identityFinishedReading,
      decisions: { networks: [item("insta")], images: { kept: [], removed: [], uploaded: [] } },
    }), "identity");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("networks");
  });

  describe("editing identity during a revision (back_to sets decisions.revising)", () => {
    it("skips straight past networks to images when networks is already decided but images still needs confirming", () => {
      const result = transitionHandoff(state({
        step: "identity", version: 8, reading: identityFinishedReading,
        decisions: { revising: true, networks: [item("insta")], needsConfirmation: ["images"] },
      }), "identity");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.step).toBe("images");
    });

    it("skips straight past networks to images when networks is decided but images was never decided at all", () => {
      const result = transitionHandoff(state({
        step: "identity", version: 8, reading: identityFinishedReading,
        decisions: { revising: true, networks: [item("insta")] },
      }), "identity");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.step).toBe("images");
    });

    it("skips BOTH networks and images, going straight to summary, when neither needs reconfirmation", () => {
      const result = transitionHandoff(state({
        step: "identity", version: 8, reading: identityFinishedReading,
        decisions: { revising: true, networks: [item("insta")], images: { kept: [], removed: [], uploaded: [] } },
      }), "identity");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.step).toBe("summary");
    });

    it("still goes through networks when revising but networks itself was never decided", () => {
      const result = transitionHandoff(state({
        step: "identity", version: 8, reading: identityFinishedReading,
        decisions: { revising: true },
      }), "identity");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.step).toBe("networks");
    });
  });
});

describe("transitionHandoff: networks -> images", () => {
  it("advances once the networks group is finished", () => {
    const reading: HandoffReading = { networks: runningReading("found") };
    const result = transitionHandoff(state({ step: "networks", version: 4, reading }), "networks");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("images");
    expect(result.value.version).toBe(5);
  });

  it("rejects while networks are still running", () => {
    const reading: HandoffReading = { networks: runningReading("running") };
    const result = transitionHandoff(state({ step: "networks", version: 4, reading }), "networks");
    expect(result.ok).toBe(false);
  });

  it("rejects when not on the networks step", () => {
    const reading: HandoffReading = { networks: runningReading("found") };
    const result = transitionHandoff(state({ step: "identity", version: 3, reading }), "networks");
    expect(result.ok).toBe(false);
  });

  it("returns to identity when needsConfirmation flags identity (the rejected Instagram palette must be re-chosen)", () => {
    const reading: HandoffReading = { networks: runningReading("found") };
    const result = transitionHandoff(state({
      step: "networks", version: 9, reading, decisions: { revising: true, needsConfirmation: ["identity"] },
    }), "networks");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("identity");
  });

  it("skips straight to summary when revising and images is already decided with nothing left to reconfirm", () => {
    const reading: HandoffReading = { networks: runningReading("found") };
    const result = transitionHandoff(state({
      step: "networks", version: 9, reading,
      decisions: { revising: true, images: { kept: [], removed: [], uploaded: [] } },
    }), "networks");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("summary");
  });

  it("still goes to images when revising but images itself needs reconfirmation", () => {
    const reading: HandoffReading = { networks: runningReading("found") };
    const result = transitionHandoff(state({
      step: "networks", version: 9, reading,
      decisions: { revising: true, images: { kept: [], removed: [], uploaded: [] }, needsConfirmation: ["images"] },
    }), "networks");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("images");
  });
});

describe("transitionHandoff: images -> summary", () => {
  it("advances once the images group is finished", () => {
    const reading: HandoffReading = { images: runningReading("not_found") };
    const result = transitionHandoff(state({ step: "images", version: 5, reading }), "images");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("summary");
    expect(result.value.version).toBe(6);
  });

  it("rejects while images are still pending", () => {
    const reading: HandoffReading = { images: runningReading("pending") };
    const result = transitionHandoff(state({ step: "images", version: 5, reading }), "images");
    expect(result.ok).toBe(false);
  });
});

describe("transitionHandoff: summary -> done (\"É isso\" blocked with a pending group)", () => {
  const readyState = () =>
    state({
      step: "summary",
      version: 6,
      source: { kind: "site", value: "https://ex.com", normalized: "ex.com" },
      reading: allGroupsFinishedReading,
      decisions: fullDecisions,
    });

  it("completes the handoff once every group finished and every decision is recorded", () => {
    const result = transitionHandoff(readyState(), "summary");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.step).toBe("done");
    expect(result.value.version).toBe(7);
  });

  it("blocks when a group is still pending", () => {
    const blocked = readyState();
    blocked.reading = { ...allGroupsFinishedReading, images: runningReading("running") };
    const result = transitionHandoff(blocked, "summary");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_transition");
  });

  it("blocks when there is no source", () => {
    const blocked = readyState();
    blocked.source = null;
    expect(transitionHandoff(blocked, "summary").ok).toBe(false);
  });

  it("blocks when a decision is missing", () => {
    const blocked = readyState();
    blocked.decisions = { ...fullDecisions, networks: undefined };
    expect(transitionHandoff(blocked, "summary").ok).toBe(false);
  });

  it("blocks when not on the summary step", () => {
    const blocked = readyState();
    blocked.step = "images";
    expect(transitionHandoff(blocked, "summary").ok).toBe(false);
  });

  it("allows a name reading that was not_found, as long as it wasn't a failure", () => {
    const ready = readyState();
    ready.reading = { ...allGroupsFinishedReading, name: runningReading("not_found") };
    const result = transitionHandoff(ready, "summary");
    expect(result.ok).toBe(true);
  });

  it("blocks when the name group's reading itself failed", () => {
    const blocked = readyState();
    blocked.reading = { ...allGroupsFinishedReading, name: runningReading("failed") };
    expect(transitionHandoff(blocked, "summary").ok).toBe(false);
  });

  it("blocks \"É isso\" while any group still needs reconfirmation after a revision", () => {
    const blocked = readyState();
    blocked.decisions = { ...fullDecisions, revising: true, needsConfirmation: ["images"] };
    const result = transitionHandoff(blocked, "summary");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_transition");
  });

  it("allows \"É isso\" again once needsConfirmation is cleared, even mid-revision", () => {
    const ready = readyState();
    ready.decisions = { ...fullDecisions, revising: true, needsConfirmation: [] };
    expect(transitionHandoff(ready, "summary").ok).toBe(true);
  });

  it("blocks \"É isso\" when a kept captured image has no managed key (old persisted summary, keyless kept item)", () => {
    const keptImage = item("img-1");
    const blocked = readyState();
    blocked.captured = { images: [keptImage] };
    blocked.decisions = { ...fullDecisions, images: { kept: [keptImage.id], removed: [], uploaded: [] } };
    const result = transitionHandoff(blocked, "summary");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_transition");
  });

  it("allows \"É isso\" once the unmanaged kept image is removed instead", () => {
    const keptImage = item("img-1");
    const ready = readyState();
    ready.captured = { images: [keptImage] };
    ready.decisions = { ...fullDecisions, images: { kept: [], removed: [keptImage.id], uploaded: [] } };
    expect(transitionHandoff(ready, "summary").ok).toBe(true);
  });
});

describe("hasUnmanagedKeptImages", () => {
  it("is false when there are no images at all", () => {
    expect(hasUnmanagedKeptImages(state({ decisions: fullDecisions }))).toBe(false);
  });

  it("is false when every kept captured image has a managed key", () => {
    const managed: HandoffItem = { ...item("img-1"), key: "workspaces/ws/img-1.png" };
    const s = state({ captured: { images: [managed] }, decisions: { ...fullDecisions, images: { kept: [managed.id], removed: [], uploaded: [] } } });
    expect(hasUnmanagedKeptImages(s)).toBe(false);
  });

  it("is true when a kept captured image has no key", () => {
    const unmanaged = item("img-1");
    const s = state({ captured: { images: [unmanaged] }, decisions: { ...fullDecisions, images: { kept: [unmanaged.id], removed: [], uploaded: [] } } });
    expect(hasUnmanagedKeptImages(s)).toBe(true);
  });

  it("is true when a kept UPLOADED image has no key", () => {
    const unmanagedUpload = item("upload-1");
    const s = state({ decisions: { ...fullDecisions, images: { kept: [unmanagedUpload.id], removed: [], uploaded: [unmanagedUpload] } } });
    expect(hasUnmanagedKeptImages(s)).toBe(true);
  });

  it("is false for a keyless image that was REMOVED, not kept", () => {
    const unmanaged = item("img-1");
    const s = state({ captured: { images: [unmanaged] }, decisions: { ...fullDecisions, images: { kept: [], removed: [unmanaged.id], uploaded: [] } } });
    expect(hasUnmanagedKeptImages(s)).toBe(false);
  });
});

describe("transitionHandoff: back (only from summary)", () => {
  it("returns to any allowed brand step from summary", () => {
    for (const target of ["source", "identity", "networks", "images"] as const) {
      const result = transitionHandoff(state({ step: "summary", version: 6 }), "back", target);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.step).toBe(target);
      expect(result.value.version).toBe(7);
    }
  });

  it("rejects going back from any step other than summary", () => {
    const result = transitionHandoff(state({ step: "networks", version: 4 }), "back", "identity");
    expect(result.ok).toBe(false);
  });

  it("rejects an unlisted or missing target", () => {
    expect(transitionHandoff(state({ step: "summary", version: 6 }), "back").ok).toBe(false);
    // @ts-expect-error invalid target on purpose
    expect(transitionHandoff(state({ step: "summary", version: 6 }), "back", "reading").ok).toBe(false);
    expect(transitionHandoff(state({ step: "summary", version: 6 }), "back", "done" as never).ok).toBe(false);
  });
});

describe("defaultNetworkSelection: what the networks card starts from", () => {
  const network = (id: string, platform: string): HandoffItem => ({ id, value: id, origin: "site", platform });

  it("keeps everything captured when it fits", () => {
    const captured = [network("fb", "facebook"), network("ig", "instagram"), network("yt", "youtube")];
    expect(defaultNetworkSelection(captured)).toEqual(["fb", "ig", "yt"]);
    expect(defaultNetworkSelection([])).toEqual([]);
  });

  it("stops at the number of networks one confirmation may keep, in discovery order", () => {
    const captured = Array.from({ length: 25 }, (_, i) => network(`fb-${i}`, "facebook"));
    expect(HANDOFF_MAX_NETWORKS).toBe(10);
    expect(defaultNetworkSelection(captured)).toEqual(captured.slice(0, 10).map(i => i.id));
  });

  it("starts from a single Instagram profile, the first one, and still takes the other networks after it", () => {
    const captured = [network("ig-1", "instagram"), network("fb", "facebook"), network("ig-2", "instagram"), network("tt", "tiktok")];
    expect(defaultNetworkSelection(captured)).toEqual(["ig-1", "fb", "tt"]);
  });

  it("counts the Instagram profile toward the limit and never skips ahead past it", () => {
    const captured = [...Array.from({ length: 10 }, (_, i) => network(`fb-${i}`, "facebook")), network("ig", "instagram")];
    expect(defaultNetworkSelection(captured)).toEqual(captured.slice(0, 10).map(i => i.id));
  });
});

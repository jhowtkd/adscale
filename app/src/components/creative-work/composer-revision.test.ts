import { describe, expect, it } from "vitest";
import {
  applyCanonicalWorkRevision,
  cachedCanonicalWorkRevision,
  EMPTY_COMPOSER_REVISION,
  isNewerWorkRevision,
  markRevisionRefreshRequired,
  parseWorkRevision,
  resolveObservedCanonicalRevision,
} from "./composer-revision";

describe("composer revision observation", () => {
  it("parses a work updatedAt into a CAS token and ignores invalid dates", () => {
    expect(parseWorkRevision("2026-09-08T20:48:21.256Z")).toBe("2026-09-08T20:48:21.256Z");
    expect(parseWorkRevision(new Date("2026-09-08T20:48:21.634Z"))).toBe("2026-09-08T20:48:21.634Z");
    expect(parseWorkRevision("not-a-date")).toBeNull();
    expect(parseWorkRevision(null)).toBeNull();
  });

  it("treats a later ISO timestamp as newer than the cached CAS token", () => {
    expect(isNewerWorkRevision("2026-09-08T20:48:21.634Z", "2026-09-08T20:48:21.256Z")).toBe(true);
    expect(isNewerWorkRevision("2026-09-08T20:48:21.256Z", "2026-09-08T20:48:21.256Z")).toBe(false);
    expect(isNewerWorkRevision("2026-09-08T20:48:21.256Z", null)).toBe(true);
  });

  it("absorbs a GET/poll revision that advanced past the local cache before the next write", () => {
    const cached = applyCanonicalWorkRevision(
      EMPTY_COMPOSER_REVISION,
      "work-1",
      "2026-09-08T20:48:21.256Z",
    );
    expect(cachedCanonicalWorkRevision(cached.state, "work-1")).toBe("2026-09-08T20:48:21.256Z");

    const absorbed = resolveObservedCanonicalRevision(
      cached.state,
      "work-1",
      "2026-09-08T20:48:21.634Z",
    );
    expect(absorbed.revision).toBe("2026-09-08T20:48:21.634Z");
    expect(cachedCanonicalWorkRevision(absorbed.state, "work-1")).toBe("2026-09-08T20:48:21.634Z");
  });

  it("keeps the cached revision when the observed GET is older or equal", () => {
    const cached = applyCanonicalWorkRevision(
      EMPTY_COMPOSER_REVISION,
      "work-1",
      "2026-09-08T20:48:21.634Z",
    );
    const same = resolveObservedCanonicalRevision(
      cached.state,
      "work-1",
      "2026-09-08T20:48:21.634Z",
    );
    expect(same.revision).toBe("2026-09-08T20:48:21.634Z");
    expect(same.state).toBe(cached.state);

    const older = resolveObservedCanonicalRevision(
      cached.state,
      "work-1",
      "2026-09-08T20:48:21.256Z",
    );
    expect(older.revision).toBe("2026-09-08T20:48:21.634Z");
    expect(older.state).toBe(cached.state);
  });

  it("keeps a refresh-required block when the observed snapshot is the same stale timestamp", () => {
    const applied = applyCanonicalWorkRevision(
      EMPTY_COMPOSER_REVISION,
      "work-1",
      "2026-09-08T20:22:54.105Z",
    );
    const blocked = markRevisionRefreshRequired(applied.state, "work-1");
    expect(cachedCanonicalWorkRevision(blocked, "work-1")).toBeNull();

    const sameStale = resolveObservedCanonicalRevision(
      blocked,
      "work-1",
      "2026-09-08T20:22:54.105Z",
    );
    expect(sameStale.revision).toBeNull();
    expect(sameStale.state).toBe(blocked);
    expect(sameStale.state.refreshRequiredWorkId).toBe("work-1");
  });

  it("clears the refresh-required block only after applyCanonicalWorkRevision from a confirmed refetch", () => {
    const applied = applyCanonicalWorkRevision(
      EMPTY_COMPOSER_REVISION,
      "work-1",
      "2026-09-08T20:22:54.105Z",
    );
    const blocked = markRevisionRefreshRequired(applied.state, "work-1");
    const recovered = applyCanonicalWorkRevision(blocked, "work-1", "2026-09-08T20:22:54.480Z");
    expect(recovered.revision).toBe("2026-09-08T20:22:54.480Z");
    expect(recovered.state.refreshRequiredWorkId).toBeNull();
    expect(cachedCanonicalWorkRevision(recovered.state, "work-1")).toBe("2026-09-08T20:22:54.480Z");
  });
});

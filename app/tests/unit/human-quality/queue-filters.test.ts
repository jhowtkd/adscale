import { describe, it, expect } from "vitest";
import { parseCorpusQueueFilters } from "@/server/human-quality/queue-filters";

describe("parseCorpusQueueFilters", () => {
  it("defaults status to pending", () => {
    const { filters, errors } = parseCorpusQueueFilters(new URLSearchParams());
    expect(errors).toHaveLength(0);
    expect(filters.status).toBe("pending");
  });

  it("parses dimensional filters", () => {
    const params = new URLSearchParams({
      workspaceId: "550e8400-e29b-41d4-a716-446655440002",
      cohort: "baseline",
      generationMode: "art_variation",
      format: "1:1",
      sourceLabel: "real_customer",
      status: "evaluated",
      limit: "25",
    });
    const { filters, errors } = parseCorpusQueueFilters(params);
    expect(errors).toHaveLength(0);
    expect(filters.cohort).toBe("baseline");
    expect(filters.sourceLabel).toBe("real_customer");
    expect(filters.limit).toBe(25);
  });

  it("rejects invalid filter values", () => {
    const { errors } = parseCorpusQueueFilters(
      new URLSearchParams({ sourceLabel: "invalid", limit: "500" })
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("parses cursor pagination params", () => {
    const cursorSelectedAt = "2026-06-17T10:00:00.000Z";
    const cursorId = "550e8400-e29b-41d4-a716-446655440001";
    const { filters, errors } = parseCorpusQueueFilters(
      new URLSearchParams({
        cursorSelectedAt,
        cursorId,
        limit: "10",
      })
    );

    expect(errors).toHaveLength(0);
    expect(filters.cursor).toEqual({
      selectedAt: new Date(cursorSelectedAt),
      id: cursorId,
    });
    expect(filters.limit).toBe(10);
  });
});

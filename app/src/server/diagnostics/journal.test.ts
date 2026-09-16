/**
 * trace-387: diagnostic journal unit tests (no database).
 *
 * Buffer bounds, drop counter, single concurrent flush, write timeout,
 * oversize reduce-or-drop, attribute enforcement and never-throw write
 * semantics are proven here with an injected writer. Durability criteria
 * (dedup, ordering, pagination, isolation, crash) are proven against real
 * Postgres in journal.pg.test.ts — never with mocks.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { NewDiagnosticEvent } from "../db/schema";
import {
  DIAGNOSTIC_EXPORT_BUDGET,
  type DiagnosticContext,
  type DiagnosticDataOrigin,
  type DiagnosticEventEnvelope,
  type DiagnosticEventName,
} from "./contract";
import {
  DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTES,
  DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTE_VALUE_LENGTH,
  createDiagnosticJournal,
  type DiagnosticJournal,
  type PersistBatch,
  type PersistBatchResult,
} from "./journal";

let seq = 0;

function makeEnvelope(overrides?: Partial<DiagnosticEventEnvelope>): DiagnosticEventEnvelope {
  seq += 1;
  const event = (overrides?.event ?? "operation.started") as DiagnosticEventName;
  return {
    eventId: `evt-unit-${seq}`,
    event,
    schemaVersion: 1,
    occurredAt: "2026-09-16T12:00:00.000Z",
    recordedAt: "2026-09-16T12:00:00.010Z",
    correlation: "full",
    context: {
      schemaVersion: 1,
      workspaceId: "ws-unit",
      clientProfileId: null,
      workItemId: "work-unit",
      protocol: "single",
      operationId: "op-unit",
      releaseSha: "abc123",
      environment: "test",
      process: "web",
      dataOrigin: "test",
    },
    ...overrides,
  };
}

function workingWriter(seen: NewDiagnosticEvent[][]): PersistBatch {
  return async (rows: NewDiagnosticEvent[]): Promise<PersistBatchResult> => {
    seen.push(rows);
    return { inserted: rows.length, duplicates: 0 };
  };
}

function silenceEmergency() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("journal buffer bounds (frozen contract budget)", () => {
  it("buffers up to 128 events then drops with a counter", async () => {
    expect(DIAGNOSTIC_EXPORT_BUDGET.maxBufferedEvents).toBe(128);
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    for (let i = 0; i < 128; i += 1) {
      journal.enqueue(makeEnvelope());
    }
    expect(journal.stats().bufferedEvents).toBe(128);
    expect(journal.stats().droppedEvents).toBe(0);
    journal.enqueue(makeEnvelope());
    expect(journal.stats().bufferedEvents).toBe(128);
    expect(journal.stats().droppedEvents).toBe(1);
    expect(journal.stats().degraded).toBe(true);
    await journal.flush();
    expect(seen.flat()).toHaveLength(128);
  });

  it("enforces the byte cap before the count cap", () => {
    const restore = silenceEmergency();
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({
      persistBatch: workingWriter(seen),
      maxBufferedBytes: 20_000,
    });
    const bulky = () => makeEnvelope({ attributes: { payload: "p".repeat(2000) } });
    for (let i = 0; i < 30; i += 1) {
      journal.enqueue(bulky());
    }
    const stats = journal.stats();
    // The 20 KiB byte cap binds while the 128-event count cap is far away.
    expect(stats.droppedEvents).toBeGreaterThan(0);
    expect(stats.bufferedEvents).toBeLessThan(30);
    expect(stats.bufferedEvents + stats.droppedEvents).toBe(30);
    restore.mockRestore();
  });

  it("flushes in batches of at most 25 events", async () => {
    expect(DIAGNOSTIC_EXPORT_BUDGET.maxBatchEvents).toBe(25);
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    for (let i = 0; i < 60; i += 1) {
      journal.enqueue(makeEnvelope());
    }
    await journal.flush();
    expect(seen.map((batch) => batch.length)).toEqual([25, 25, 10]);
    expect(journal.stats().persistedEvents).toBe(60);
  });
});

describe("journal single concurrent flush", () => {
  it("joins concurrent flush calls into one writer invocation", async () => {
    let calls = 0;
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const journal = createDiagnosticJournal({
      persistBatch: async (rows) => {
        calls += 1;
        await gate;
        return { inserted: rows.length, duplicates: 0 };
      },
    });
    journal.enqueue(makeEnvelope());
    const first = journal.flush();
    const second = journal.flush();
    await Promise.resolve();
    open();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(journal.stats().persistedEvents).toBe(1);
  });
});

describe("journal write timeout", () => {
  it("resolves the flush past a hung writer and keeps events for retry", async () => {
    const restore = silenceEmergency();
    let hang = true;
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({
      persistBatch: async (rows) => {
        if (hang) {
          await new Promise<void>(() => {});
        }
        seen.push(rows);
        return { inserted: rows.length, duplicates: 0 };
      },
      writeTimeoutMs: 20,
    });
    journal.enqueue(makeEnvelope());
    await journal.flush();
    expect(journal.stats().failedFlushes).toBe(1);
    expect(journal.stats().bufferedEvents).toBe(1);
    hang = false;
    await journal.flush();
    expect(seen.flat()).toHaveLength(1);
    expect(journal.stats().persistedEvents).toBe(1);
    restore.mockRestore();
  });
});

describe("journal oversize events", () => {
  it("reduces events above 16 KiB by dropping attributes with a marker", async () => {
    expect(DIAGNOSTIC_EXPORT_BUDGET.maxEventBytes).toBe(16 * 1024);
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    const big: Record<string, string> = {};
    for (let i = 0; i < 40; i += 1) {
      big[`key-${i}`] = "x".repeat(600);
    }
    journal.enqueue(makeEnvelope({ attributes: big }));
    expect(journal.stats().droppedEvents).toBe(0);
    await journal.flush();
    expect(seen.flat()).toHaveLength(1);
    const row = seen.flat()[0] as NewDiagnosticEvent & {
      attributes: Record<string, string>;
    };
    expect(row.attributes["diagnostic.reduced"]).toBe("oversize-attributes-dropped");
    expect(JSON.stringify(row).length).toBeLessThan(16 * 1024);
  });

  it("drops events still oversize after reduction and counts them", () => {
    const restore = silenceEmergency();
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    journal.enqueue(
      makeEnvelope({
        error: {
          errorClass: "E",
          status: null,
          reason: "y".repeat(20 * 1024),
        },
      }),
    );
    expect(journal.stats().droppedEvents).toBe(1);
    expect(journal.stats().bufferedEvents).toBe(0);
    restore.mockRestore();
  });
});

describe("journal attribute limits", () => {
  it("caps keys, truncates long values and drops non-scalars", async () => {
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    const attributes: Record<string, unknown> = {
      ok: "fine",
      long: "v".repeat(600),
      nested: { deep: true },
      list: [1, 2],
    };
    for (let i = 0; i < 40; i += 1) {
      attributes[`extra-${i}`] = i;
    }
    journal.enqueue(makeEnvelope({ attributes: attributes as never }));
    await journal.flush();
    const row = seen.flat()[0].attributes as unknown as Record<string, unknown>;
    expect(Object.keys(row)).toHaveLength(DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTES);
    expect(row["ok"]).toBe("fine");
    expect(String(row["long"])).toHaveLength(DIAGNOSTIC_JOURNAL_MAX_ATTRIBUTE_VALUE_LENGTH);
    expect(row["nested"]).toBeUndefined();
    expect(row["list"]).toBeUndefined();
  });

  it("redacts secrets in attributes without mutating the input", async () => {
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    const attributes = {
      access_token: "sekret",
      inputTokens: 12,
      note: "Bearer abcdef",
    };
    journal.enqueue(makeEnvelope({ attributes }));
    await journal.flush();
    const row = seen.flat()[0].attributes as unknown as Record<string, unknown>;
    expect(row["access_token"]).toBe("[REDACTED]");
    expect(row["inputTokens"]).toBe(12);
    expect(String(row["note"])).toContain("[REDACTED]");
    expect(attributes.access_token).toBe("sekret");
  });
});

describe("journal dedup by event identity", () => {
  it("skips re-enqueue of an already buffered eventId", async () => {
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    const event = makeEnvelope({ eventId: "evt-dedup-1" });
    journal.enqueue(event);
    journal.enqueue({ ...event });
    expect(journal.stats().duplicateEvents).toBe(1);
    await journal.flush();
    expect(seen.flat()).toHaveLength(1);
  });

  it("counts writer-reported conflicts as duplicates, not losses", async () => {
    const journal = createDiagnosticJournal({
      persistBatch: async (rows) => ({ inserted: 0, duplicates: rows.length }),
    });
    journal.enqueue(makeEnvelope());
    await journal.flush();
    expect(journal.stats().duplicateEvents).toBe(1);
    expect(journal.stats().droppedEvents).toBe(0);
    expect(journal.stats().degraded).toBe(false);
  });
});

describe("journal never breaks the caller", () => {
  it("emit resolves without waiting for the flush", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const journal = createDiagnosticJournal({
      persistBatch: async (rows) => {
        calls += 1;
        await gate;
        return { inserted: rows.length, duplicates: 0 };
      },
      writeTimeoutMs: 30_000,
    });
    await journal.emit(makeEnvelope());
    // The background flush started (writer invoked) while emit already resolved.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(journal.stats().bufferedEvents).toBe(0);
    release();
    await journal.flush();
    expect(journal.stats().persistedEvents).toBe(1);
  });

  it("invalid events are dropped and counted, never thrown", () => {
    const restore = silenceEmergency();
    const journal = createDiagnosticJournal({
      persistBatch: workingWriter([]),
    });
    const cases: DiagnosticEventEnvelope[] = [
      makeEnvelope({ eventId: "" }),
      makeEnvelope({ event: "invented.event" as DiagnosticEventName }),
      makeEnvelope({ schemaVersion: 99 as 1 }),
      makeEnvelope({ occurredAt: "not-a-date" }),
      makeEnvelope({ context: null }),
    ];
    for (const event of cases) {
      expect(() => journal.enqueue(event)).not.toThrow();
    }
    expect(journal.stats().droppedEvents).toBe(cases.length);
    expect(journal.stats().bufferedEvents).toBe(0);
    restore.mockRestore();
  });

  it("invalid correlation and dataOrigin are dropped, valid batch keeps flowing", async () => {
    const restore = silenceEmergency();
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    const validContext = makeEnvelope().context as DiagnosticContext;
    const cases: DiagnosticEventEnvelope[] = [
      makeEnvelope({ correlation: "bogus" as DiagnosticEventEnvelope["correlation"] }),
      makeEnvelope({
        context: { ...validContext, dataOrigin: "prod" as DiagnosticDataOrigin },
      }),
    ];
    for (const event of cases) {
      expect(() => journal.enqueue(event)).not.toThrow();
    }
    const good = makeEnvelope();
    journal.enqueue(good);
    expect(journal.stats().droppedEvents).toBe(cases.length);
    expect(journal.stats().bufferedEvents).toBe(1);
    await journal.flush();
    expect(seen.flat()).toHaveLength(1);
    expect(seen.flat()[0].id).toBe(good.eventId);
    expect(journal.stats().persistedEvents).toBe(1);
    expect(journal.stats().failedFlushes).toBe(0);
    restore.mockRestore();
  });

  it("flush resolves when the writer throws and keeps events for retry", async () => {
    const restore = silenceEmergency();
    let fail = true;
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({
      persistBatch: async (rows) => {
        if (fail) {
          throw new Error("db down");
        }
        seen.push(rows);
        return { inserted: rows.length, duplicates: 0 };
      },
    });
    journal.enqueue(makeEnvelope());
    await expect(journal.flush()).resolves.toBeUndefined();
    expect(journal.stats().failedFlushes).toBe(1);
    fail = false;
    await journal.flush();
    expect(seen.flat()).toHaveLength(1);
    restore.mockRestore();
  });

  it("emit never rejects, even for invalid events with a dead writer", async () => {
    const restore = silenceEmergency();
    const journal: DiagnosticJournal = createDiagnosticJournal({
      persistBatch: async () => {
        throw new Error("db down");
      },
    });
    await expect(
      journal.emit(makeEnvelope({ eventId: "" })),
    ).resolves.toBeUndefined();
    await expect(journal.emit(makeEnvelope())).resolves.toBeUndefined();
    restore.mockRestore();
  });
});

describe("journal shutdown", () => {
  it("resolves within budget past a hung writer and reports unflushed as dropped", async () => {
    const restore = silenceEmergency();
    const journal = createDiagnosticJournal({
      persistBatch: async () => {
        await new Promise<void>(() => {});
      },
      writeTimeoutMs: 30_000,
    });
    journal.enqueue(makeEnvelope());
    journal.enqueue(makeEnvelope());
    await journal.shutdown(30);
    expect(journal.stats().droppedEvents).toBe(2);
    expect(journal.stats().bufferedEvents).toBe(0);
    restore.mockRestore();
  });

  it("persists buffered events when shutdown has budget", async () => {
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    journal.enqueue(makeEnvelope());
    await journal.shutdown(5_000);
    expect(seen.flat()).toHaveLength(1);
    expect(journal.stats().droppedEvents).toBe(0);
  });
});

describe("journal periodic flush", () => {
  it("flushes every second while started and stops on demand", async () => {
    vi.useFakeTimers();
    const seen: NewDiagnosticEvent[][] = [];
    const journal = createDiagnosticJournal({ persistBatch: workingWriter(seen) });
    journal.start();
    journal.start();
    journal.enqueue(makeEnvelope());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seen.flat()).toHaveLength(1);
    journal.stop();
    journal.enqueue(makeEnvelope());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(seen.flat()).toHaveLength(1);
    await journal.flush();
    expect(seen.flat()).toHaveLength(2);
  });
});

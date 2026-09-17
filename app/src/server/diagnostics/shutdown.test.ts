import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __uninstallObservabilityShutdownHooksForTests,
  installObservabilityShutdownHooks,
} from "./shutdown";

afterEach(() => {
  __uninstallObservabilityShutdownHooksForTests();
  vi.restoreAllMocks();
});

function listenerCount(event: string): number {
  return process.listeners(event).filter((listener) =>
    String((listener as { __adscaleObservabilityShutdown?: unknown }).__adscaleObservabilityShutdown ?? "").startsWith("1"),
  ).length;
}

describe("installObservabilityShutdownHooks", () => {
  it("installs SIGTERM handling exactly once", () => {
    installObservabilityShutdownHooks({ reRaiseSignal: false });
    installObservabilityShutdownHooks({ reRaiseSignal: false });
    expect(listenerCount("SIGTERM")).toBe(1);
  });

  it("runs a timed shutdown on SIGTERM without re-raising when disabled", async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    installObservabilityShutdownHooks({ shutdown, timeoutMs: 25, reRaiseSignal: false });
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(shutdown).toHaveBeenCalledTimes(1));
  });

  it("runs shutdown only once across repeated signals", async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    installObservabilityShutdownHooks({ shutdown, timeoutMs: 25, reRaiseSignal: false });
    process.emit("SIGTERM");
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(shutdown).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it("uninstall removes every installed listener", () => {
    installObservabilityShutdownHooks({ reRaiseSignal: false });
    __uninstallObservabilityShutdownHooksForTests();
    expect(listenerCount("SIGTERM")).toBe(0);
  });
});

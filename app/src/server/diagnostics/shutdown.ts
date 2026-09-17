import "server-only";

import {
  shutdownDiagnosticJournal,
  stopDiagnosticJournal,
} from "./journal";
import { shutdownObservability } from "./observability";

/**
 * Process shutdown hooks for observability (jhowtkd/adscale#389, carried
 * from the #388 review).
 *
 * The model-call tracer is the first runtime consumer of the isolated AI
 * runtime, so it owns the shutdown sequencing: SIGTERM/SIGINT run one
 * timed shutdown (journal drain, then the AI-tracing runtime close) and
 * the process then dies with the original signal — unless the caller
 * opts out of the re-raise (tests). The `exit` hook only stops background
 * timers synchronously; async work is impossible there.
 *
 * Everything is best-effort and idempotent: hooks never throw into the
 * host process and never change how generation runs.
 */

/** Default budget for the whole observability shutdown. */
export const OBSERVABILITY_SHUTDOWN_TIMEOUT_MS = 5_000;

export interface ObservabilityShutdownHooksOptions {
  /** Budget for the timed shutdown. Defaults to 5 s. */
  timeoutMs?: number;
  /**
   * Shutdown runner override (tests). Defaults to the real journal +
   * observability shutdown.
   */
  shutdown?: () => Promise<void>;
  /**
   * Re-raise the received signal after shutdown so the process exits with
   * it (production default). Tests pass false to stay alive.
   */
  reRaiseSignal?: boolean;
}

type ShutdownSignal = "SIGTERM" | "SIGINT";

const SIGNALS: ShutdownSignal[] = ["SIGTERM", "SIGINT"];

type SignalHandler = (signal: ShutdownSignal) => void;

let installed: { onSignal: SignalHandler; onExit: () => void } | null = null;
let shutdownOnce: Promise<void> | null = null;

async function defaultShutdown(timeoutMs: number): Promise<void> {
  try {
    await shutdownDiagnosticJournal(timeoutMs);
  } catch {
    // Best-effort: the AI runtime still gets its own budget below.
  }
  try {
    await shutdownObservability(timeoutMs);
  } catch {
    // shutdownObservability never rejects; belt-and-braces.
  }
}

function markInstalled<T extends object>(fn: T): T {
  (fn as Record<string, unknown>).__adscaleObservabilityShutdown = "1";
  return fn;
}

/**
 * Install the observability shutdown hooks exactly once per process.
 * A second call is a no-op (first options win).
 */
export function installObservabilityShutdownHooks(
  options: ObservabilityShutdownHooksOptions = {},
): void {
  if (installed) return;
  const timeoutMs = options.timeoutMs ?? OBSERVABILITY_SHUTDOWN_TIMEOUT_MS;
  const shutdown = options.shutdown ?? (() => defaultShutdown(timeoutMs));
  const reRaiseSignal = options.reRaiseSignal ?? true;

  const runOnce = (): Promise<void> => {
    if (!shutdownOnce) {
      shutdownOnce = (async () => {
        try {
          await shutdown();
        } catch {
          // Shutdown faults are swallowed: the process must still exit.
        }
      })();
    }
    return shutdownOnce;
  };

  const onSignal: SignalHandler = markInstalled((signal: ShutdownSignal) => {
    void runOnce().finally(() => {
      if (!reRaiseSignal) return;
      try {
        // Remove our own listeners so the re-raised signal kills the
        // process with its default disposition (original exit semantics).
        if (installed) {
          for (const name of SIGNALS) {
            process.removeListener(name, installed.onSignal);
          }
        }
        process.kill(process.pid, signal);
      } catch {
        // If the re-raise fails the process stays alive; nothing safe to do.
      }
    });
  });

  const onExit = markInstalled(() => {
    try {
      // Synchronous only: the exit hook cannot await a flush. Stopping the
      // periodic timers keeps a late event loop from holding the process.
      stopDiagnosticJournal();
    } catch {
      // Never throw from an exit hook.
    }
  });

  installed = { onSignal, onExit };
  for (const name of SIGNALS) {
    process.on(name, onSignal);
  }
  process.on("exit", onExit);
}

/** Test-only uninstall. Never use in production code. */
export function __uninstallObservabilityShutdownHooksForTests(): void {
  if (!installed) {
    shutdownOnce = null;
    return;
  }
  for (const name of SIGNALS) {
    process.removeListener(name, installed.onSignal);
  }
  process.removeListener("exit", installed.onExit);
  installed = null;
  shutdownOnce = null;
}

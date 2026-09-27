// Pure domain core for the Equipe module ("Operação da conta").
// No I/O: no db, no fetch, no Date.now()/new Date() — time enters via the
// Clock port (clock.ts) and is threaded through as data.

export type DomainError = {
  /** Stable machine-readable code, e.g. "invalid_transition". */
  code: string;
  /** Human-readable detail for logs and API errors. */
  message: string;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: DomainError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

/** Outcome of a state-machine transition: the new state plus domain events. */
export type Transition<S, E> = {
  state: S;
  events: E[];
};

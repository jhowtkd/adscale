import { refundCredits } from "@/server/billing/credits";

export type GenerationSettlementRefund = Parameters<typeof refundCredits>[0];

export type GenerationSettlementChargeResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; reason: string; details?: unknown };

export type GenerationSettlementDispatchFailure<T> = {
  value: T;
  refunds: GenerationSettlementRefund[];
  resumeAfterCompensation?: boolean;
};

export type GenerationSettlementDeferred<T> =
  | { status: "settled"; value: T }
  | {
      status: "dispatch_failed";
      failure: GenerationSettlementDispatchFailure<T>;
    };

export type GenerationSettlementReservation<T> = {
  claimed: boolean;
  value: T;
};

export interface GenerationSettlementAdapter<
  T,
  R extends GenerationSettlementReservation<T> = GenerationSettlementReservation<T>,
> {
  reserve(): Promise<R>;
  join?(reservation: R): Promise<GenerationSettlementDeferred<T> | null>;
  charge(reservation: R): Promise<GenerationSettlementChargeResult>;
  resolveReplay?(
    reservation: R,
  ): Promise<GenerationSettlementDeferred<T> | null>;
  release(reservation: R): Promise<void>;
  dispatch(reservation: R): Promise<void>;
  failDispatch(
    reservation: R,
    error: unknown,
  ): Promise<GenerationSettlementDispatchFailure<T>>;
  completeDispatch(reservation: R): Promise<T>;
}

async function compensateDispatchFailure<T>(
  failure: GenerationSettlementDispatchFailure<T>,
) {
  let compensated = true;
  for (const refund of failure.refunds) {
    try {
      await refundCredits(refund);
    } catch {
      compensated = false;
    }
  }
  if (compensated && failure.resumeAfterCompensation) {
    return { ok: true as const, value: failure.value };
  }
  return {
    ok: false as const,
    error: {
      code: "dispatch_failed" as const,
      value: failure.value,
      compensated,
    },
  };
}

export async function startGenerationSettlement<
  T,
  R extends GenerationSettlementReservation<T>,
>(
  adapter: GenerationSettlementAdapter<T, R>,
): Promise<
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: "credit_blocked";
        reason: string;
        details?: unknown;
      };
    }
  | {
      ok: false;
      error: {
        code: "dispatch_failed";
        value: T;
        compensated: boolean;
      };
    }
> {
  const reservation = await adapter.reserve();
  if (!reservation.claimed) {
    const joined = adapter.join
      ? await adapter.join(reservation)
      : { status: "settled" as const, value: reservation.value };
    if (joined?.status === "settled") {
      return { ok: true, value: joined.value };
    }
    if (joined?.status === "dispatch_failed") {
      return compensateDispatchFailure(joined.failure);
    }
    return startGenerationSettlement(adapter);
  }

  let charge: GenerationSettlementChargeResult;
  try {
    charge = await adapter.charge(reservation);
  } catch (error) {
    await adapter.release(reservation);
    throw error;
  }
  if (!charge.ok) {
    await adapter.release(reservation);
    return {
      ok: false,
      error: {
        code: "credit_blocked",
        reason: charge.reason,
        details: charge.details,
      },
    };
  }
  if (charge.duplicate && adapter.resolveReplay) {
    let replay: GenerationSettlementDeferred<T> | null;
    try {
      replay = await adapter.resolveReplay(reservation);
    } catch (error) {
      await adapter.release(reservation);
      throw error;
    }
    await adapter.release(reservation);
    if (replay?.status === "settled") {
      return { ok: true, value: replay.value };
    }
    if (replay?.status === "dispatch_failed") {
      return compensateDispatchFailure(replay.failure);
    }
    throw new Error("generation_settlement_replay_missing");
  }
  try {
    await adapter.dispatch(reservation);
  } catch (error) {
    try {
      const failure = await adapter.failDispatch(reservation, error);
      return compensateDispatchFailure(failure);
    } catch {
      return {
        ok: false,
        error: {
          code: "dispatch_failed",
          value: reservation.value,
          compensated: false,
        },
      };
    }
  }
  return {
    ok: true,
    value: await adapter.completeDispatch(reservation),
  };
}

import type { SpendResult } from "@/server/billing/paywall";
import { refundCredits } from "@/server/billing/credits";

export type GenerationSettlementRefund = Parameters<typeof refundCredits>[0];

export type GenerationSettlementDispatchFailure<T> = {
  value: T;
  refunds: GenerationSettlementRefund[];
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
  join?(reservation: R): Promise<T | null>;
  charge(reservation: R): Promise<SpendResult>;
  resolveReplay?(reservation: R): Promise<T | null>;
  release(reservation: R): Promise<void>;
  dispatch(reservation: R): Promise<void>;
  failDispatch(
    reservation: R,
    error: unknown,
  ): Promise<GenerationSettlementDispatchFailure<T>>;
  completeDispatch(reservation: R): Promise<T>;
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
        spend: Extract<SpendResult, { ok: false }>;
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
      : reservation.value;
    if (joined) return { ok: true, value: joined };
    return startGenerationSettlement(adapter);
  }

  let spend: SpendResult;
  try {
    spend = await adapter.charge(reservation);
  } catch (error) {
    await adapter.release(reservation);
    throw error;
  }
  if (!spend.ok) {
    await adapter.release(reservation);
    return { ok: false, error: { code: "credit_blocked", spend } };
  }
  if (spend.duplicate && adapter.resolveReplay) {
    const replay = await adapter.resolveReplay(reservation);
    if (replay) {
      await adapter.release(reservation);
      return { ok: true, value: replay };
    }
  }
  try {
    await adapter.dispatch(reservation);
  } catch (error) {
    const failure = await adapter.failDispatch(reservation, error);
    let compensated = true;
    for (const refund of failure.refunds) {
      try {
        await refundCredits(refund);
      } catch {
        compensated = false;
      }
    }
    return {
      ok: false,
      error: {
        code: "dispatch_failed",
        value: failure.value,
        compensated,
      },
    };
  }
  return {
    ok: true,
    value: await adapter.completeDispatch(reservation),
  };
}

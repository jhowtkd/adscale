import type { BetaAnalyticsEvent } from "../db/schema";
import {
  summarizeMissionCreditSignals,
  type MissionCreditSignalSummary,
} from "../feedback/mission-credit-signals";

export interface EventCreditSignals {
  creditBlockedCount: number;
  creditSpendCount: number;
  surpriseCount: number;
  recentSurprises: Array<{
    eventId: string;
    sessionId: string | null;
    operation: string;
    estimateCredits: number;
    actualCredits: number;
    delta: number;
    createdAt: string;
  }>;
}

export interface OwnerCreditSignalSummary extends MissionCreditSignalSummary {
  eventSignals: EventCreditSignals;
}

function propNumber(event: BetaAnalyticsEvent, key: string): number | null {
  const value = event.properties?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function propString(event: BetaAnalyticsEvent, key: string): string | null {
  const value = event.properties?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function summarizeEventCreditSignals(
  events: BetaAnalyticsEvent[]
): EventCreditSignals {
  let creditBlockedCount = 0;
  let creditSpendCount = 0;
  const recentSurprises: EventCreditSignals["recentSurprises"] = [];

  for (const event of events) {
    if (event.eventKey === "credit_blocked") {
      creditBlockedCount += 1;
    }
    if (event.eventKey === "credit_spend") {
      creditSpendCount += 1;
      const estimate = propNumber(event, "estimateCredits");
      const actual = propNumber(event, "actualCredits");
      if (
        estimate !== null &&
        actual !== null &&
        estimate !== actual &&
        recentSurprises.length < 10
      ) {
        recentSurprises.push({
          eventId: event.id,
          sessionId: event.sessionId,
          operation: propString(event, "operation") ?? "unknown",
          estimateCredits: estimate,
          actualCredits: actual,
          delta: actual - estimate,
          createdAt: event.createdAt.toISOString(),
        });
      }
    }
  }

  return {
    creditBlockedCount,
    creditSpendCount,
    surpriseCount: recentSurprises.length,
    recentSurprises,
  };
}

export async function summarizeOwnerCreditSignals(
  events: BetaAnalyticsEvent[]
): Promise<OwnerCreditSignalSummary> {
  const feedbackSummary = await summarizeMissionCreditSignals();
  const eventSignals = summarizeEventCreditSignals(events);

  return {
    ...feedbackSummary,
    eventSignals,
  };
}

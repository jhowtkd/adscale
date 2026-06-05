"use client";

import { useMutation } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import {
  buildContextCompleteness,
  collectDiagnosticContext,
  collectSentryCorrelation,
  tagSentryFeedbackContext,
} from "@/lib/feedback/diagnostic-collector";
import type { SubmitFeedbackInput } from "@/lib/feedback/types";

export function useSubmitFeedback() {
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMutation({
    mutationFn: async (input: SubmitFeedbackInput) => {
      const route = input.route ?? pathname;
      const query = searchParams?.toString();
      const diagnosticContext = collectDiagnosticContext(locale, route, query);
      const sentryCorrelation = collectSentryCorrelation();
      const contextCompleteness = buildContextCompleteness({
        ...input,
        route,
      });

      const res = await apiFetch("/api/feedback/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...input,
          route,
          contextKind: input.contextKind ?? "global",
          diagnosticContext,
          sentryCorrelation,
          contextCompleteness,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to submit feedback");
      }

      const body = (await res.json()) as { report: { id: string } };
      tagSentryFeedbackContext({
        feedbackReportId: body.report.id,
        feedbackType: input.type,
        feedbackRoute: route,
        campaignId: input.campaignId,
        derivationId: input.derivationId,
      });

      return body.report;
    },
  });
}

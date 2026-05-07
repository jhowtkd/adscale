import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type {
  BriefingDoctorInput,
  BriefingDoctorIssue,
  BriefingDoctorReadiness,
  BriefingFieldPatch,
} from "@/lib/briefing-doctor";

export interface BriefingDoctorSuggestion {
  field: BriefingFieldPatch["field"];
  title: string;
  suggestedValue: string | string[];
  rationale: string;
}

export interface BriefingDoctorAnalysis {
  overallScore: number;
  readiness: BriefingDoctorReadiness;
  issues: BriefingDoctorIssue[];
  suggestions: BriefingDoctorSuggestion[];
  improvedBrief: Record<string, unknown>;
  fieldPatches: BriefingFieldPatch[];
}

export function useBriefingDoctorAnalysis() {
  return useMutation({
    mutationFn: async (briefing: BriefingDoctorInput): Promise<BriefingDoctorAnalysis> => {
      const res = await apiFetch("/api/briefing-doctor/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefing }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Briefing analysis failed");
      }
      const data = await res.json();
      return data.analysis as BriefingDoctorAnalysis;
    },
  });
}

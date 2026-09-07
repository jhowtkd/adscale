"use client";

import { useEffect } from "react";
import { nextPreparedPlanTracking } from "./composer-view";
import type { MutableRefObject } from "react";

export function useComposerPlanSync(input: {
  preparedPlan: { preparedRevision: string; workId: string } | null;
  hydratingPreparedPlanRevisionRef: MutableRefObject<string | null>;
  preparedPlanInputRef: MutableRefObject<{ revision: string; signature: string } | null>;
  setPreparedPlanInput: (value: { revision: string; signature: string } | null) => void;
  planInputSignature: string;
  invalidatedPlanRevision: string | null;
  setInvalidatedPlanRevision: (revision: string | null) => void;
  recordStudioEvent: (event: "studio_plan_changed" | "studio_plan_shown", properties: { creativeWorkId: string }) => void;
  workflowVariant: string;
  stage: string;
  shownPreparedRevisionRef: MutableRefObject<string | null>;
}): void {
  const {
    preparedPlan,
    hydratingPreparedPlanRevisionRef,
    preparedPlanInputRef,
    setPreparedPlanInput,
    planInputSignature,
    invalidatedPlanRevision,
    setInvalidatedPlanRevision,
    recordStudioEvent,
    workflowVariant,
    stage,
    shownPreparedRevisionRef,
  } = input;

  useEffect(() => {
    const next = nextPreparedPlanTracking({
      preparedPlan,
      hydratingRevision: hydratingPreparedPlanRevisionRef.current,
      previous: preparedPlanInputRef.current,
      planInputSignature,
      invalidatedPlanRevision,
    });
    hydratingPreparedPlanRevisionRef.current = next.hydratingRevision;
    setPreparedPlanInput(next.preparedInput);
    if (next.invalidatedPlanRevision !== invalidatedPlanRevision) {
      setInvalidatedPlanRevision(next.invalidatedPlanRevision);
    }
    if (next.emitPlanChanged && preparedPlan) {
      recordStudioEvent("studio_plan_changed", { creativeWorkId: preparedPlan.workId });
    }
  }, [
    hydratingPreparedPlanRevisionRef,
    invalidatedPlanRevision,
    planInputSignature,
    preparedPlan,
    preparedPlanInputRef,
    setPreparedPlanInput,
    recordStudioEvent,
    setInvalidatedPlanRevision,
  ]);

  useEffect(() => {
    if (workflowVariant !== "progressive" || stage !== "plan" || !preparedPlan || shownPreparedRevisionRef.current === preparedPlan.preparedRevision) return;
    shownPreparedRevisionRef.current = preparedPlan.preparedRevision;
    recordStudioEvent("studio_plan_shown", { creativeWorkId: preparedPlan.workId });
  }, [preparedPlan, recordStudioEvent, shownPreparedRevisionRef, stage, workflowVariant]);
}

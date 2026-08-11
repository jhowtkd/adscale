"use client";

import { useState } from "react";
import type { CreativeWorkOutput } from "@/lib/hooks/use-creative-work";
import CreativeProposalGrid from "./CreativeProposalGrid";

export function CreativeReviewPrototype({ outputs }: { outputs: CreativeWorkOutput[] }) {
  const [notice, setNotice] = useState("");

  return (
    <>
      <CreativeProposalGrid
        outputs={outputs}
        onRetry={() => setNotice("Repetir é apenas demonstrativo nesta fixture.")}
        onApprove={() => setNotice("Aprovar é apenas demonstrativo nesta fixture.")}
        onDownload={() => setNotice("Baixar é apenas demonstrativo nesta fixture.")}
        onRevise={() => setNotice("Editar é apenas demonstrativo nesta fixture.")}
      />
      <p role="status" className={notice ? "mt-3 text-center text-sm text-[var(--text-secondary)]" : "sr-only"}>{notice}</p>
    </>
  );
}

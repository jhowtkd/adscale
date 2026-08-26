"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreativeComposer } from "./CreativeComposer";
import { useCreativeComposer } from "./useCreativeComposer";

export function CreativeWorkResumeSurface({
  workId,
  campaignId = null,
}: {
  workId: string;
  campaignId?: string | null;
}) {
  const { composerRef, ...composer } = useCreativeComposer({
    initialWorkId: workId,
    focusComposer: true,
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6 lg:py-12">
      <Link
        href={campaignId ? `/campaigns/${campaignId}` : "/campaigns"}
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {campaignId ? "Voltar para a campanha" : "Trabalhos"}
      </Link>
      <CreativeComposer composer={composer} composerRef={composerRef} layout="piece" />
      <Link href={`/?workId=${encodeURIComponent(workId)}&intent=variations`} className="inline-flex text-sm font-medium text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
        Nova variação
      </Link>
    </div>
  );
}

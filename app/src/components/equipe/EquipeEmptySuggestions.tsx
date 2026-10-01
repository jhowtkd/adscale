import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EMPTY_SCREEN_SUGGESTIONS } from "@/lib/equipe/suggestions";

/** The fixed starters of an empty screen (B2). A click leads to `/` with the phrase already sent in the conversation. */
export default function EquipeEmptySuggestions({ surface }: { surface: keyof typeof EMPTY_SCREEN_SUGGESTIONS }) {
  return (
    <ul className="m-0 flex w-full max-w-[480px] list-none flex-col gap-2 p-0" data-testid="equipe-empty-suggestions">
      {EMPTY_SCREEN_SUGGESTIONS[surface].map((text) => (
        <li key={text}>
          <Link
            href={{ pathname: "/", query: { suggestion: text } }}
            className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3 text-left text-sm text-[var(--text-primary)] outline-none transition-colors hover:bg-[var(--surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
          >
            <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />
            <span>{text}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

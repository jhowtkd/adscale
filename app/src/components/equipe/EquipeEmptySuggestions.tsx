import Link from "next/link";
import { EMPTY_SCREEN_SUGGESTIONS } from "@/lib/equipe/suggestions";

/** Ticket 09 consumes ?suggestion= in the home and mounts these fixed lists. */
export default function EquipeEmptySuggestions({ surface }: { surface: keyof typeof EMPTY_SCREEN_SUGGESTIONS }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="equipe-empty-suggestions">
      {EMPTY_SCREEN_SUGGESTIONS[surface].map((text) => (
        <li key={text}>
          <Link href={{ pathname: "/", query: { suggestion: text } }}
            className="block rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm hover:bg-[var(--surface-inset)]">
            <span aria-hidden="true">→ </span>{text}
          </Link>
        </li>
      ))}
    </ul>
  );
}

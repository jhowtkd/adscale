"use client";

import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type PrototypeVariant<T extends string> = { id: T; label: string };

export function PrototypeSwitcher<T extends string>({
  variants,
  current,
}: {
  variants: readonly PrototypeVariant<T>[];
  current: T;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const index = variants.findIndex(({ id }) => id === current);

  const choose = (next: T) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const cycle = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        !["ArrowLeft", "ArrowRight"].includes(event.key) ||
        (target instanceof Element && target.matches("input, textarea, select, [contenteditable='true']"))
      ) return;
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      choose(variants[(index + offset + variants.length) % variants.length]!.id);
    };
    window.addEventListener("keydown", cycle);
    return () => window.removeEventListener("keydown", cycle);
  });

  const selected = variants[index]!;
  return (
    <div role="group" aria-label="Alternar variante do protótipo" className="fixed bottom-4 left-1/2 z-[var(--layer-overlay)] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-neutral-950/95 p-1.5 text-white shadow-2xl backdrop-blur">
      <button type="button" aria-label="Variante anterior" onClick={() => choose(variants[(index + variants.length - 1) % variants.length]!.id)} className="rounded-full p-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ChevronLeft /></button>
      <span className="min-w-44 text-center text-xs"><strong>{current}/{variants.length}</strong> · {selected.label}</span>
      <button type="button" aria-label="Próxima variante" onClick={() => choose(variants[(index + 1) % variants.length]!.id)} className="rounded-full p-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ChevronRight /></button>
    </div>
  );
}

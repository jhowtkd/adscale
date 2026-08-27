"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Cell = readonly [index: number, color: number];

const STACK: Cell[] = [
  [43, 3], [44, 3], [45, 3], [46, 3],
  [49, 1], [50, 1], [51, 5], [52, 5], [54, 6], [55, 6],
  [56, 4], [57, 4], [58, 2], [59, 2], [60, 3], [61, 3], [62, 5], [63, 5],
];

const FRAMES: Cell[][] = [
  [[2, 1], [3, 1], [4, 1], [11, 1], ...STACK],
  [[10, 1], [11, 1], [12, 1], [19, 1], ...STACK],
  [[18, 1], [19, 1], [20, 1], [27, 1], ...STACK],
  [[26, 1], [27, 1], [28, 1], [35, 1], ...STACK],
  [[34, 1], [35, 1], [36, 1], [43, 1], ...STACK],
  [[34, 1], [35, 1], [36, 1], [43, 1], ...STACK],
  [[4, 2], [12, 2], [20, 2], [28, 2], ...STACK],
  [[12, 2], [20, 2], [28, 2], [36, 2], ...STACK],
  [[20, 2], [28, 2], [36, 2], [44, 2], ...STACK],
];

const COLORS = [
  "var(--info-text, #38bdf8)",
  "var(--warning-text, #fb923c)",
  "var(--selection-text, #a78bfa)",
  "var(--success-text, #4ade80)",
  "var(--danger-text, #fb7185)",
  "var(--text-secondary, #94a3b8)",
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function TetrisLoader({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % FRAMES.length), 220);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const cells = new Map(FRAMES[reducedMotion ? 4 : frame]);

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("grid shrink-0 grid-cols-8 gap-1", className)}
    >
      {Array.from({ length: 64 }, (_, index) => {
        const color = cells.get(index);
        return (
          <span
            key={index}
            aria-hidden="true"
            className="size-1.5 rounded-[2px]"
            style={{ backgroundColor: color ? COLORS[color - 1] : "var(--border-subtle)" }}
          />
        );
      })}
    </span>
  );
}

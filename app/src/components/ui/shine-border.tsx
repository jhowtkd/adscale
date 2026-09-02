"use client";

import { cn } from "@/lib/utils";

export const SHINE_COLORS = ["#A07CFE", "#FE8FB5", "#FFBE7B"] as const;

type TColorProp = string | readonly string[];

interface ShineBorderProps {
  borderRadius?: number;
  borderWidth?: number;
  duration?: number;
  color?: TColorProp;
  className?: string;
  children: React.ReactNode;
}

export function ShineBorder({
  borderRadius = 8,
  borderWidth = 1,
  duration = 14,
  color = "#000000",
  className,
  children,
}: ShineBorderProps) {
  const shineColor = Array.isArray(color) ? color.join(",") : color;

  return (
    <div
      className={cn("relative", className)}
      style={{ borderRadius: `${borderRadius}px` }}
    >
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] will-change-[background-position] motion-safe:animate-shine"
        style={
          {
            "--duration": `${duration}s`,
            padding: `${borderWidth}px`,
            backgroundImage: `radial-gradient(transparent,transparent, ${shineColor},transparent,transparent)`,
            backgroundSize: "300% 300%",
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            maskComposite: "exclude",
            WebkitMaskComposite: "xor",
          } as React.CSSProperties
        }
      />
    </div>
  );
}

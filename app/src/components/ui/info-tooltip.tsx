"use client"

import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"

interface InfoTooltipProps {
  text: string
  className?: string
  side?: "top" | "bottom" | "left" | "right"
}

export function InfoTooltip({ text, className, side = "top" }: InfoTooltipProps) {
  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          className={cn(
            "inline-flex items-center justify-center rounded-full p-0.5 text-[var(--text-muted)] transition-colors hover:text-[var(--accent-green)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]",
            className
          )}
          aria-label="Mais informações"
        >
          <Info size={14} />
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] text-[13px] leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

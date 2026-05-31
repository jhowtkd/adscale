"use client";

import { useEffect, useSyncExternalStore, useState, useCallback, useEffectEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { X, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

interface TourStep {
  target: string;
  title: string;
  description: string;
  placement?: "top" | "bottom" | "left" | "right";
}

interface OnboardingTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

export function OnboardingTour({ steps, onComplete, onSkip }: OnboardingTourProps) {
  const t = useTranslations("onboarding");
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: "top" | "bottom" | "left" | "right" }>({ top: 0, left: 0, placement: "bottom" });
  const [highlightPos, setHighlightPos] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

	  const calculatePositions = useCallback(() => {
    const step = steps[currentStep];
    if (!step) return;

    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
      // Target not found, center tooltip
      setTooltipPos({ top: window.innerHeight / 2 - 100, left: window.innerWidth / 2 - 150, placement: "bottom" });
      setHighlightPos({ top: 0, left: 0, width: 0, height: 0 });
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const padding = 8;
    const tooltipWidth = 320;
    const tooltipHeight = 180;

    setHighlightPos({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    let top = rect.bottom + 16;
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    let placement: "top" | "bottom" | "left" | "right" = step.placement || "bottom";

    // Adjust based on available space
    if (placement === "bottom" && top + tooltipHeight > window.innerHeight - 20) {
      placement = "top";
      top = rect.top - tooltipHeight - 16;
    }
    if (placement === "top" && top < 20) {
      placement = "bottom";
      top = rect.bottom + 16;
    }

    // Clamp horizontal
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    // Clamp vertical
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

    setTooltipPos({ top, left, placement });
	  }, [currentStep, steps]);
  const runCalculatePositions = useEffectEvent(calculatePositions);

  useEffect(() => {
    const handleResize = () => runCalculatePositions();
    const rafId = requestAnimationFrame(handleResize);
    window.addEventListener("resize", handleResize);
    
    // Throttled scroll handler using RAF
    let ticking = false;
    const throttledScroll = () => {
      if (!ticking) {
	        requestAnimationFrame(() => {
	          runCalculatePositions();
	          ticking = false;
	        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", throttledScroll, true);
    
    return () => {
	      cancelAnimationFrame(rafId);
	      window.removeEventListener("resize", handleResize);
	      window.removeEventListener("scroll", throttledScroll, true);
	    };
	  }, []);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => runCalculatePositions());
    return () => cancelAnimationFrame(rafId);
  }, [currentStep, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  if (!mounted) return null;

  const isLast = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[100]" aria-label="Onboarding tour">
      {/* Dark overlay with cutout */}
      <svg className="absolute inset-0 size-full">
        <defs>
          <mask id="onboarding-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlightPos.width > 0 && (
              <rect
                x={highlightPos.left}
                y={highlightPos.top}
                width={highlightPos.width}
                height={highlightPos.height}
                rx="12"
                ry="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.55)"
          mask="url(#onboarding-mask)"
          className="transition-all duration-300"
        />
      </svg>

      {/* Highlight border */}
      {highlightPos.width > 0 && (
        <div
          className="absolute rounded-xl border-2 border-[var(--accent-green)] shadow-[0_0_0_4px_var(--accent-green-dim)0.2),0_0_24px_var(--accent-green-dim)0.15)] transition-all duration-300 pointer-events-none"
          style={{
            top: highlightPos.top,
            left: highlightPos.left,
            width: highlightPos.width,
            height: highlightPos.height,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute w-[320px] rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.18)] transition-all duration-300"
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        {/* Arrow */}
        <div
          className={cn(
            "absolute size-3 rotate-45 border bg-[var(--surface-base)]",
            tooltipPos.placement === "bottom" && "-top-1.5 left-1/2 -translate-x-1/2 border-t border-l border-[var(--border-dim)]",
            tooltipPos.placement === "top" && "-bottom-1.5 left-1/2 -translate-x-1/2 border-b border-r border-[var(--border-dim)]",
            tooltipPos.placement === "left" && "-right-1.5 top-1/2 -translate-y-1/2 border-t border-r border-[var(--border-dim)]",
            tooltipPos.placement === "right" && "-left-1.5 top-1/2 -translate-y-1/2 border-b border-l border-[var(--border-dim)]"
          )}
        />

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          Passo {currentStep + 1} de {steps.length}: {steps[currentStep]?.title}
        </div>

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-[var(--accent-green-dim)]">
              <Sparkles size={14} className="text-[var(--accent-green)]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {steps[currentStep]?.title}
            </h3>
          </div>
          <button type="button"
            onClick={onSkip}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={t("skip")}
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-5">
          {steps[currentStep]?.description}
        </p>

        <div className="flex items-center justify-between">
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {steps.map((step, i) => (
              <button type="button"
                key={step.target}
                onClick={() => setCurrentStep(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === currentStep ? "w-5 bg-[var(--accent-green)]" : "w-1.5 bg-[var(--border-dim)] hover:bg-[var(--border-medium)]"
                )}
                aria-label={`${t("step")} ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button type="button"
                onClick={handlePrev}
                className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--deep-bg)] transition-colors"
              >
                <ChevronLeft size={14} />
                {t("back")}
              </button>
            )}
            <button type="button"
              onClick={handleNext}
              className="flex items-center gap-1 rounded-md bg-[var(--accent-green)] px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--accent-green-hover)] transition-colors"
            >
              {isLast ? t("finish") : t("next")}
              {!isLast && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

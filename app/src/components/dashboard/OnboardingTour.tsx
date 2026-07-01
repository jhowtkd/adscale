"use client";

import { useEffect, useSyncExternalStore, useState, useCallback, useEffectEvent, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
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

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function OnboardingTour({ steps, onComplete, onSkip }: OnboardingTourProps) {
  const t = useTranslations("onboarding");
  const reducedMotion = useReducedMotion();
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: "top" | "bottom" | "left" | "right" }>({ top: 0, left: 0, placement: "bottom" });
  const [highlightPos, setHighlightPos] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const motionClass = reducedMotion ? "" : "transition-all duration-300";

  const calculatePositions = useCallback(() => {
    const step = steps[currentStep];
    if (!step) return;

    const targetEl = document.querySelector(step.target);
    if (!targetEl) {
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

    if (placement === "bottom" && top + tooltipHeight > window.innerHeight - 20) {
      placement = "top";
      top = rect.top - tooltipHeight - 16;
    }
    if (placement === "top" && top < 20) {
      placement = "bottom";
      top = rect.bottom + 16;
    }

    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

    setTooltipPos({ top, left, placement });
  }, [currentStep, steps]);
  const runCalculatePositions = useEffectEvent(calculatePositions);

  useEffect(() => {
    const handleResize = () => runCalculatePositions();
    const rafId = requestAnimationFrame(handleResize);
    window.addEventListener("resize", handleResize);

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

  useEffect(() => {
    if (!mounted) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const focusables = Array.from(
      tooltip.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    (nextButtonRef.current ?? focusables[0])?.focus();

    return () => {
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, [currentStep, mounted, t]);

  const handleFocusTrap = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !tooltipRef.current) return;

    const focusables = Array.from(
      tooltipRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => !el.hasAttribute("disabled"));

    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

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
  const stepTitle = steps[currentStep]?.title ?? "";

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={t("stepProgress", { current: currentStep + 1, total: steps.length, title: stepTitle })}
      onKeyDown={handleFocusTrap}
    >
      <svg className="absolute inset-0 size-full" aria-hidden="true">
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
          className={motionClass}
        />
      </svg>

      {highlightPos.width > 0 && (
        <div
          className={cn(
            "absolute rounded-xl border-2 border-[var(--accent-green)] shadow-[0_0_0_4px_var(--accent-green-dim),0_0_24px_var(--accent-green-dim)] pointer-events-none",
            motionClass
          )}
          style={{
            top: highlightPos.top,
            left: highlightPos.left,
            width: highlightPos.width,
            height: highlightPos.height,
          }}
          aria-hidden="true"
        />
      )}

      <div
        ref={tooltipRef}
        className={cn(
          "absolute w-[320px] rounded-xl border border-[var(--border-dim)] bg-[var(--surface-base)] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.18)]",
          motionClass
        )}
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        <div
          className={cn(
            "absolute size-3 rotate-45 border bg-[var(--surface-base)]",
            tooltipPos.placement === "bottom" && "-top-1.5 left-1/2 -translate-x-1/2 border-t border-l border-[var(--border-dim)]",
            tooltipPos.placement === "top" && "-bottom-1.5 left-1/2 -translate-x-1/2 border-b border-r border-[var(--border-dim)]",
            tooltipPos.placement === "left" && "-right-1.5 top-1/2 -translate-y-1/2 border-t border-r border-[var(--border-dim)]",
            tooltipPos.placement === "right" && "-left-1.5 top-1/2 -translate-y-1/2 border-b border-l border-[var(--border-dim)]"
          )}
          aria-hidden="true"
        />

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {t("stepProgress", { current: currentStep + 1, total: steps.length, title: stepTitle })}
        </div>

        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-[var(--accent-green-dim)]">
              <Sparkles size={14} className="text-[var(--accent-green-text)]" aria-hidden="true" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {stepTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="flex size-11 items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={t("skip")}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {steps[currentStep]?.description}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5" role="tablist" aria-label={t("step")}>
            {steps.map((step, i) => (
              <button
                type="button"
                key={step.target}
                onClick={() => setCurrentStep(i)}
                role="tab"
                aria-selected={i === currentStep}
                aria-label={`${t("step")} ${i + 1}`}
                className={cn(
                  "flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors duration-200",
                  i === currentStep
                    ? "bg-[var(--accent-green-dim)]"
                    : "hover:bg-[var(--deep-bg)]"
                )}
              >
                <span
                  className={cn(
                    "block rounded-full transition-all duration-200",
                    i === currentStep ? "h-1.5 w-5 bg-[var(--accent-green)]" : "size-1.5 bg-[var(--border-dim)]"
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="flex min-h-11 items-center gap-1 rounded-md px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--deep-bg)] transition-colors"
              >
                <ChevronLeft size={14} aria-hidden="true" />
                {t("back")}
              </button>
            )}
            <button
              ref={nextButtonRef}
              type="button"
              onClick={handleNext}
              className="flex min-h-11 items-center gap-1 rounded-md bg-[var(--accent-green)] px-4 py-2 text-[13px] font-medium text-[var(--ink)] hover:bg-[var(--accent-green-light)] transition-colors"
            >
              {isLast ? t("finish") : t("next")}
              {!isLast ? <ChevronRight size={14} aria-hidden="true" /> : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

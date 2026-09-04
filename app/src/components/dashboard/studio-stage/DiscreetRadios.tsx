"use client";

import { cn } from "@/lib/utils";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

export function discreetRadioClass(checked: boolean) {
  return cn(
    "min-h-8 rounded-full px-3 text-xs font-medium",
    checked
      ? "bg-white/14 text-[var(--text-primary)]"
      : "text-[var(--text-muted)] hover:bg-white/6 hover:text-[var(--text-primary)]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    focus,
  );
}

export type DiscreetRadioOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export function DiscreetRadios<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: {
  label: string;
  value: T;
  options: Array<DiscreetRadioOption<T>>;
  onChange?: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex flex-nowrap gap-0.5", className)}>
      {options.map((option) => {
        const checked = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled || option.disabled || !onChange}
            onClick={() => onChange?.(option.value)}
            className={discreetRadioClass(checked)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

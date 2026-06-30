"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  getPasswordStrength,
  validatePassword,
  type PasswordStrength,
} from "./password-utils";

const strengthConfig: Record<
  PasswordStrength,
  { label: string; color: string; segments: number }
> = {
  empty: { label: "", color: "var(--border-dim)", segments: 0 },
  weak: { label: "Weak", color: "var(--accent-rose)", segments: 1 },
  fair: { label: "Fair", color: "var(--accent-amber)", segments: 2 },
  good: { label: "Good", color: "var(--accent-blue)", segments: 3 },
  strong: { label: "Strong", color: "var(--accent-teal)", segments: 4 },
};

// ============================================
// Password Input Component
// ============================================

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  showStrengthMeter?: boolean;
  showRequirements?: boolean;
  error?: string;
  autoComplete?: string;
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
  label = "Password",
  id = "password",
  showStrengthMeter = false,
  showRequirements = false,
  error,
  autoComplete = "current-password",
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const t = useTranslations("auth");

  const requirements = useMemo(() => validatePassword(value), [value]);
  const strength = useMemo(
    () => getPasswordStrength(requirements),
    [requirements]
  );
  const config = strengthConfig[strength];

  const requirementLabelMap: Record<string, string> = {
    "8+ characters": t("requirements.length"),
    "Uppercase letter": t("requirements.uppercase"),
    "Number": t("requirements.number"),
    "Special character": t("requirements.special"),
  };

  return (
    <div className="space-y-2">
      {/* Label */}
      <label
        htmlFor={id}
        className="block text-xs font-medium tracking-wide text-[var(--text-secondary)]"
      >
        {label}
      </label>

      {/* Input with toggle */}
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full h-10 rounded-[var(--radius-control)] border px-3 pr-10 text-sm",
            "bg-[var(--surface-raised)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]",
            "transition-all duration-200",
            error
              ? "border-[var(--danger-border)] focus:border-[var(--danger-border)]"
              : "border-[var(--border-default)]"
          )}
        />

        {/* Toggle visibility button */}
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Hide password" : "Show password"}
          className={cn(
            "absolute right-3 top-1/2 -translate-y-1/2",
            "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            "transition-colors duration-200 focus:outline-none"
          )}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {/* Strength Meter */}
      {showStrengthMeter && value.length > 0 && (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-1.5 pt-1"
        >
          {/* Segmented bar */}
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((segment) => (
              <m.div
                key={segment}
                className="h-1 flex-1 rounded-full"
                style={{
                  backgroundColor:
                    segment <= config.segments
                      ? config.color
                      : "var(--border-dim)",
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.2, delay: segment * 0.05 }}
              />
            ))}
          </div>

          {/* Strength label */}
          <p
            className="text-xs font-medium"
            style={{ color: config.color }}
          >
            {strength !== "empty" ? t(`passwordStrength.${strength}`) : ""}
          </p>
        </m.div>
      )}

      {/* Hint text */}
      {showStrengthMeter && value.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] pt-0.5">
          {t("passwordHint")}
        </p>
      )}

      {/* Requirements Checklist */}
      {showRequirements && value.length > 0 && (
        <AnimatePresence>
          <m.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-1 pt-1"
          >
            {requirements.map((req) => (
              <m.li
                key={req.label}
                className="flex items-center gap-1.5 text-xs"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
              >
                {req.met ? (
                  <Check
                    size={12}
                    className="text-[var(--accent-teal)] flex-shrink-0"
                  />
                ) : (
                  <X
                    size={12}
                    className="text-[var(--text-muted)] flex-shrink-0"
                  />
                )}
                <span
                  className={
                    req.met
                      ? "text-[var(--accent-teal)]"
                      : "text-[var(--text-muted)]"
                  }
                >
                  {requirementLabelMap[req.label] ?? req.label}
                </span>
              </m.li>
            ))}
          </m.ul>
        </AnimatePresence>
      )}
    </div>
  );
}

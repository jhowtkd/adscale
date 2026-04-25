"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// Password Validation Utilities
// ============================================

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export function validatePassword(password: string): PasswordRequirement[] {
  return [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong" | "empty";

export function getPasswordStrength(
  requirements: PasswordRequirement[]
): PasswordStrength {
  const metCount = requirements.filter((r) => r.met).length;
  if (metCount === 0) return "empty";
  if (metCount <= 1) return "weak";
  if (metCount === 2) return "fair";
  if (metCount === 3) return "good";
  return "strong";
}

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
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const requirements = useMemo(() => validatePassword(value), [value]);
  const strength = useMemo(
    () => getPasswordStrength(requirements),
    [requirements]
  );
  const config = strengthConfig[strength];

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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full h-10 rounded-md border px-3 pr-10 text-sm",
            "bg-[var(--surface-base)] text-[var(--text-primary)]",
            "placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:ring-[3px] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.1)]",
            "transition-all duration-200",
            error
              ? "border-[var(--accent-rose)] focus:border-[var(--accent-rose)] focus:ring-[rgba(244,63,94,0.15)]"
              : "border-[var(--border-dim)] focus:border-[var(--accent-blue)] focus:ring-[rgba(99,102,241,0.15)]"
          )}
        />

        {/* Toggle visibility button */}
        <button
          type="button"
          onClick={() => setVisible(!visible)}
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
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-1.5 pt-1"
        >
          {/* Segmented bar */}
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((segment) => (
              <motion.div
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
            {config.label}
          </p>
        </motion.div>
      )}

      {/* Hint text */}
      {showStrengthMeter && value.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] pt-0.5">
          Use 8+ characters with a mix of letters, numbers &amp; symbols
        </p>
      )}

      {/* Requirements Checklist */}
      {showRequirements && value.length > 0 && (
        <AnimatePresence>
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-1 pt-1"
          >
            {requirements.map((req) => (
              <motion.li
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
                  {req.label}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </AnimatePresence>
      )}
    </div>
  );
}

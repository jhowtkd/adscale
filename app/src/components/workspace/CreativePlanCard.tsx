"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Check,
  Pencil,
  RefreshCw,
  ChevronDown,
  Clock,
  Info,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { CreativePlan } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface CreativePlanCardProps {
  plan: CreativePlan;
  onApprove: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  approved: boolean;
  isEditing?: boolean;
}

// ============================================
// Accordion Item Component
// ============================================

interface AccordionItemProps {
  title: string;
  platformTags: string[];
  children: React.ReactNode;
  index: number;
}

function AccordionItem({ title, platformTags, children }: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-[var(--border-dim)] rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 bg-[var(--surface-raised)]/50 hover:bg-[var(--surface-raised)] transition-colors duration-150"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{title}</span>
          <div className="flex gap-1.5">
            {platformTags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--accent-mint-dim)] text-[var(--accent-mint)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as const }}
        >
          <ChevronDown size={16} className="text-[var(--text-muted)]" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
              opacity: { duration: 0.2, delay: isOpen ? 0.05 : 0 },
            }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 bg-[var(--surface-base)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function CreativePlanCard({
  plan,
  onApprove,
  onEdit,
  onRegenerate,
  approved,
}: CreativePlanCardProps) {
  const [copiedCta, setCopiedCta] = useState<string | null>(null);
  const t = useTranslations("plan");
  const commonT = useTranslations("common");
  const campaignT = useTranslations("campaign");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyCta = async (cta: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(cta);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = cta;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedCta(cta);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedCta(null), 2000);
    } catch {
      // Silently ignore copy failures
    }
  };

  const sectionVariants = {
    hidden: { opacity: 0, y: 16 },
    show: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.4,
        ease: [0.19, 1, 0.22, 1] as const,
      },
    }),
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] as const, delay: 0.2 }}
      className={cn(
        "relative bg-[var(--surface-base)] rounded-xl overflow-hidden",
        "border border-[var(--border-dim)]",
        approved && "border-[var(--accent-mint)]/30"
      )}
    >
      {/* Purple left border accent */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-400",
          approved ? "bg-[var(--accent-mint)]" : "bg-[var(--accent-mint)]"
        )}
      />

      <div className="pl-6 pr-6 py-6 space-y-6">
        {/* ---- Header ---- */}
        <motion.div
          custom={0}
          variants={sectionVariants}
          initial="hidden"
          animate="show"
          className="flex items-center justify-between flex-wrap gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-mint-dim)] border border-[var(--accent-mint)]/15">
              <Sparkles size={14} className="text-[var(--accent-mint)]" />
              <span className="text-xs font-medium text-[var(--accent-mint)]">
                AI Generated
              </span>
            </div>
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Clock size={12} />
              Generated 2 minutes ago
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--accent-amber)] flex items-center gap-1">
              <Info size={12} />
              ~{plan.angles.length * 2.4} credits estimated
            </span>
            {approved && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="flex items-center gap-1 text-xs font-medium text-[var(--accent-teal)]"
              >
                <Check size={14} strokeWidth={3} />
                {campaignT("status.approved")}
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* ---- Strategy Summary ---- */}
        <motion.div
          custom={1}
          variants={sectionVariants}
          initial="hidden"
          animate="show"
          className="border-l-2 border-[var(--accent-mint)] pl-3"
        >
          <h4 className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">
            {t("strategy")}
          </h4>
          <p className="text-base leading-relaxed text-[var(--text-primary)]">
            {plan.strategy}
          </p>
        </motion.div>

        {/* ---- Creative Angles ---- */}
        <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="show">
          <h4 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            {t("angles")}
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)]">
              {plan.angles.length}
            </span>
          </h4>
          <div className="space-y-4">
            {plan.angles.map((angle) => (
              <div key={angle.number} className="flex gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-mint)] w-7 flex-shrink-0 pt-0.5">
                  {String(angle.number).padStart(2, "0")}
                </span>
                <div>
                  <h5 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                    {angle.title}
                  </h5>
                  <p className="text-sm text-[var(--text-secondary)] mb-2">
                    {angle.description}
                  </p>
                  {plan.hooks[angle.number - 1] && (
                    <div className="bg-[var(--surface-raised)] rounded-md px-3 py-2 border border-[var(--border-dim)]">
                      <p className="text-[13px] italic text-[var(--text-muted)]">
                        &ldquo;{plan.hooks[angle.number - 1]}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ---- Hook Variations ---- */}
        <motion.div custom={3} variants={sectionVariants} initial="hidden" animate="show">
          <h4 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">
            {t("hooks")}
          </h4>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {plan.hooks.map((hook, i) => {
              const tags = ["Headline", "Body", "CTA"];
              return (
                <div
                  key={i}
                  className="flex-shrink-0 max-w-[280px] bg-[var(--surface-raised)] rounded-lg p-4 border border-[var(--border-dim)]"
                >
                  <p className="text-sm text-[var(--text-primary)] italic mb-2">{hook}</p>
                  <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--surface-base)] text-[var(--text-muted)] uppercase tracking-wide">
                    {tags[i % tags.length]}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* ---- CTA Recommendations ---- */}
        <motion.div custom={4} variants={sectionVariants} initial="hidden" animate="show">
          <h4 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">
            {t("ctas")}
          </h4>
          <div className="flex flex-wrap gap-2">
            {plan.ctas.map((cta) => (
              <button
                key={cta}
                onClick={() => handleCopyCta(cta)}
                className="relative inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium bg-[var(--accent-mint-dim)] text-[var(--accent-mint)] hover:bg-[rgba(47,182,125,0.2)] transition-colors duration-200"
                title="Click to copy"
              >
                {cta}
                <AnimatePresence>
                  {copiedCta === cta && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center rounded-full bg-[var(--accent-mint)] text-white text-xs font-medium"
                    >
                      Copied!
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ---- Variation Breakdown (Accordion) ---- */}
        <motion.div custom={5} variants={sectionVariants} initial="hidden" animate="show">
          <h4 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            Planned Variations
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--surface-raised)] text-[var(--text-muted)]">
              {plan.angles.length}
            </span>
          </h4>
          <div className="space-y-2">
            {plan.angles.map((angle, i) => (
              <AccordionItem
                key={angle.number}
                title={`${angle.title} Variation`}
                platformTags={["Meta"]}
                index={i}
              >
                <div className="space-y-3">
                  <div>
                    <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                      Angle
                    </span>
                    <p className="text-sm text-[var(--text-primary)] mt-0.5">
                      {angle.title}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                      Hook
                    </span>
                    <p className="text-sm text-[var(--text-primary)] mt-0.5 italic">
                      &ldquo;{plan.hooks[i] || "N/A"}&rdquo;
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                      Visual Direction
                    </span>
                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                      {angle.description}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                      CTA
                    </span>
                    <p className="text-sm text-[var(--accent-mint)] mt-0.5">
                      {plan.ctas[i % plan.ctas.length]}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-[var(--text-muted)]">
                      ~2.4 credits
                    </span>
                  </div>
                </div>
              </AccordionItem>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ---- Action Bar ---- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="sticky bottom-0 z-10 flex items-center justify-between px-6 py-4 bg-[var(--surface-base)] border-t border-[var(--border-dim)]"
      >
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onApprove}
            disabled={approved}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-all duration-200",
              approved
                ? "bg-[var(--accent-teal)]/20 text-[var(--accent-teal)] cursor-default"
                : "bg-[var(--accent-blue)] text-white hover:bg-[var(--accent-blue-light)] hover:-translate-y-px active:scale-[0.98]"
            )}
          >
            <Check size={16} />
            {approved ? campaignT("status.approved") : t("approvePlan")}
          </motion.button>

          <button
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-200 bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-dim)] hover:bg-[var(--surface-base)] hover:border-[var(--border-medium)] active:scale-[0.98]"
          >
            <Pencil size={14} />
            {commonT("edit")}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRegenerate}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-200 text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] active:scale-[0.98]"
          >
            <RefreshCw size={14} />
            {commonT("regenerate")}
          </button>

          <span className="text-xs text-[var(--text-muted)]">
            ~{plan.angles.length * 2.4} credits total
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import CreativePlanCard from "./CreativePlanCard";
import type { CreativePlan } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface PlanStepProps {
  plan: CreativePlan | null;
  onApprove: () => void;
  onGenerateDerivations: () => void;
  approved: boolean;
  isGenerating?: boolean;
}

// ============================================
// Loading Dots Component
// ============================================

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-[var(--accent-mint)]"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ============================================
// Component
// ============================================

export default function PlanStep({ plan, onApprove, onGenerateDerivations, approved, isGenerating }: PlanStepProps) {
  const t = useTranslations("plan");
  const tc = useTranslations("common");
  const [isLoading, setIsLoading] = useState(!plan);
  const [isEditing, setIsEditing] = useState(false);

  // Simulate loading if no plan yet
  if (isLoading && !plan) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center min-h-[400px] bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)]"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="mb-4"
        >
          <div className="relative">
            <Sparkles size={40} className="text-[var(--accent-mint)]" />
            <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-mint)] border-t-transparent animate-spin" 
              style={{ width: 56, height: 56, top: -8, left: -8 }}
            />
          </div>
        </motion.div>

        <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">
          {t("generating")}
        </h3>

        <LoadingDots />
      </motion.div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-[var(--surface-base)] rounded-xl border border-[var(--border-dim)]">
        <p className="text-sm text-[var(--text-muted)]">{t("noPlan")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto">
      <CreativePlanCard
        plan={plan}
        onApprove={onApprove}
        onEdit={() => setIsEditing(!isEditing)}
        onRegenerate={() => setIsLoading(true)}
        approved={approved}
        isEditing={isEditing}
      />

      {/* Generate Derivations button - shown when approved */}
      <AnimatePresence>
        {approved && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }}
            className="mt-6 flex justify-center"
          >
            <motion.button
              whileHover={isGenerating ? undefined : { scale: 1.02 }}
              whileTap={isGenerating ? undefined : { scale: 0.98 }}
              onClick={onGenerateDerivations}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 rounded-md px-8 py-3 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-light)] shadow-lg shadow-[rgba(99,102,241,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles size={16} />
              {isGenerating ? tc("loading") : t("generateDerivations")}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

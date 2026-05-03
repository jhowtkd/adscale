"use client";

import { motion } from "framer-motion";
import {
  Check,
  CreditCard,
  Download,
  TrendingUp,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ============================================
// Billing Tab
// ============================================

export default function BillingTab() {
  const billing = useAppStore((s) => s.billing);
  const paymentMethod = useAppStore((s) => s.paymentMethod);
  const usageHistory = useAppStore((s) => s.usageHistory);
  const addToast = useAppStore((s) => s.addToast);

  const usagePercent = Math.round((billing.creditsUsed / billing.creditsTotal) * 100);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Plan & Credits */}
        <div className="space-y-6">
          {/* Current Plan Card */}
          <motion.div
            variants={itemVariants}
            className={cn(
              "rounded-xl p-6 space-y-4",
              "bg-[var(--surface-base)] border border-[var(--border-medium)]",
              "relative overflow-hidden"
            )}
            style={{
              background: "var(--surface-base)",
              borderLeft: "3px solid var(--accent-mint)",
            }}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-[22px] font-semibold text-[var(--text-primary)]">
                {billing.planName}
              </h3>
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  "bg-[var(--accent-blue-dim)] text-[var(--accent-blue-light)]"
                )}
              >
                {billing.billingCycle}
              </span>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-[28px] font-bold text-[var(--text-primary)]">
                {billing.planPrice}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">
                /month
              </span>
            </div>

            <p className="text-sm text-[var(--text-secondary)]">
              Renews on {billing.renewalDate}
            </p>

            {/* Features list */}
            <ul className="space-y-2 pt-2">
              {billing.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
                >
                  <Check
                    size={16}
                    className="text-[var(--accent-teal)] flex-shrink-0"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => addToast("info", "Plan change coming soon")}
                className={cn(
                  "h-9 px-4 rounded-md text-sm font-medium",
                  "bg-[var(--surface-raised)] text-[var(--text-primary)]",
                  "border border-[var(--border-dim)]",
                  "hover:bg-[var(--surface-base)] hover:border-[var(--border-medium)]",
                  "transition-all duration-200"
                )}
              >
                Change Plan
              </button>
              <button
                onClick={() => addToast("warning", "Contact support to cancel")}
                className="h-9 px-4 rounded-md text-sm font-medium text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 transition-all duration-200"
              >
                Cancel
              </button>
            </div>
          </motion.div>

          {/* Credit Usage */}
          <motion.div
            variants={itemVariants}
            className={cn(
              "rounded-xl p-6 space-y-4",
              "bg-[var(--surface-base)] border border-[var(--border-dim)]"
            )}
          >
            <div className="flex items-center gap-2">
              <Coins size={18} className="text-[var(--accent-blue)]" />
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Credit Usage
              </h3>
            </div>

            <p className="text-sm text-[var(--text-secondary)]">
              {billing.creditsUsed} of {billing.creditsTotal} credits used (
              {usagePercent}%)
            </p>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-[var(--border-dim)] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${usagePercent}%` }}
                transition={{ duration: 0.8, ease: [0.19, 1, 0.22, 1] }}
                className="h-full rounded-full bg-[var(--accent-mint)]"
              />
            </div>

            {/* Breakdown */}
            <div className="space-y-1.5 pt-1">
              <p className="text-xs text-[var(--text-muted)]">
                Plan generation: ~12 credits
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Image derivations: ~380 credits
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Exports: ~20 credits
              </p>
            </div>

            <button
              onClick={() => addToast("info", "Credit purchase coming soon")}
              className={cn(
                "w-full h-10 rounded-md text-sm font-medium",
                "bg-[var(--surface-raised)] text-[var(--text-primary)]",
                "border border-[var(--border-dim)]",
                "hover:bg-[var(--surface-base)] hover:border-[var(--border-medium)]",
                "active:scale-[0.98]",
                "transition-all duration-200"
              )}
            >
              Buy Extra Credits
            </button>
          </motion.div>

          {/* Payment Method */}
          <motion.div
            variants={itemVariants}
            className={cn(
              "rounded-xl p-4",
              "bg-[var(--surface-raised)] border border-[var(--border-dim)]"
            )}
          >
            <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">
              Payment Method
            </h4>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-7 rounded bg-[var(--surface-base)] border border-[var(--border-dim)] flex items-center justify-center">
                  <CreditCard size={16} className="text-[var(--text-secondary)]" />
                </div>
                <div>
                  <p className="text-sm text-[var(--text-primary)]">
                    &bull;&bull;&bull;&bull; {paymentMethod.last4}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Expires {paymentMethod.expiryMonth}/{paymentMethod.expiryYear}
                  </p>
                </div>
              </div>
              <button
                onClick={() => addToast("info", "Payment update coming soon")}
                className="text-sm text-[var(--accent-blue)] hover:underline"
              >
                Update
              </button>
            </div>
          </motion.div>
        </div>

        {/* Right: Usage History */}
        <motion.div variants={itemVariants} className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-[var(--text-secondary)]" />
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Usage History
            </h3>
          </div>

          <div className={cn(
            "rounded-xl border border-[var(--border-dim)] overflow-hidden"
          )}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-dim)] bg-[var(--surface-raised)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Date
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Description
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Credits
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usageHistory.map((record, index) => (
                    <motion.tr
                      key={record.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.04 }}
                      className={cn(
                        "border-b border-[var(--border-dim)] last:border-b-0",
                        "hover:bg-[var(--surface-raised)] transition-colors"
                      )}
                    >
                      <td className="px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap">
                        {record.date}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)]">
                        {record.description}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-medium whitespace-nowrap",
                          record.creditsUsed > 0
                            ? "text-[var(--accent-teal)]"
                            : "text-[var(--accent-amber)]"
                        )}
                      >
                        {record.creditsUsed > 0
                          ? `+${record.creditsUsed}`
                          : record.creditsUsed}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)] whitespace-nowrap">
                        {record.balance}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invoices Section */}
          <div className="space-y-3 pt-2">
            <h4 className="text-sm font-medium text-[var(--text-primary)]">
              Recent Invoices
            </h4>
            <div className="space-y-2">
              {[
                { date: "Feb 14, 2025", amount: "$49.00", status: "Paid" },
                { date: "Jan 14, 2025", amount: "$49.00", status: "Paid" },
                { date: "Dec 14, 2024", amount: "$49.00", status: "Paid" },
              ].map((invoice) => (
                <div
                  key={invoice.date}
                  className={cn(
                    "flex items-center justify-between py-2.5 px-3 rounded-lg",
                    "bg-[var(--surface-base)] border border-[var(--border-dim)]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--text-secondary)]">
                      {invoice.date}
                    </span>
                    <span className="text-sm text-[var(--text-primary)] font-medium">
                      {invoice.amount}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        "bg-[rgba(20,184,166,0.12)] text-[var(--accent-teal)]"
                      )}
                    >
                      {invoice.status}
                    </span>
                  </div>
                  <button
                    onClick={() => addToast("info", "Invoice download coming soon")}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <Download size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

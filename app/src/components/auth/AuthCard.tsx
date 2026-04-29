"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
}

export default function AuthCard({ children, className }: AuthCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.5,
        delay: 0.2,
        ease: [0.19, 1, 0.22, 1],
      }}
      className={cn(
        "w-full max-w-[420px] rounded-xl p-8",
        "bg-[var(--surface-base)] border border-[var(--border-dim)]",
        "shadow-[0_8px_32px_rgba(0,0,0,0.06)]",
        "relative overflow-hidden",
        className
      )}
    >
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

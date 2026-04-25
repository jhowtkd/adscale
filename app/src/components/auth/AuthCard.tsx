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
        "shadow-[0_24px_64px_rgba(0,0,0,0.5)]",
        "relative overflow-hidden",
        className
      )}
    >
      {/* Gradient border glow effect */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none"
        style={{
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(20,184,166,0.04) 50%, transparent 100%)",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
          padding: "1px",
        }}
      />

      {/* Subtle glass shimmer */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none opacity-30"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

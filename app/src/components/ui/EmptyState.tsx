"use client";


import { cn } from "@/lib/utils";
import Image from "next/image";

interface EmptyStateProps {
  illustration?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export default function EmptyState({
  illustration = "/empty-campaigns.svg",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn("animate-fade-in",
        "flex flex-col items-center justify-center py-12 px-4 text-center",
        className
      )}
    >
      {/* Illustration */}
      <div className="relative w-[200px] h-[160px] mb-6">
        <Image
          src={illustration}
          alt={title}
          fill
          className="object-contain opacity-80"
        />
      </div>

      {/* Title */}
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-[var(--text-secondary)] max-w-[280px] mb-5">
        {description}
      </p>

      {/* Action button */}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 bg-[var(--accent-mint)] hover:bg-[var(--accent-mint-light)] hover:-translate-y-px active:scale-[0.98]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { type LucideIcon, ChevronRight } from "lucide-react";
import { FadeIn } from "@/components/animations/FadeIn";
import { Button } from "@/components/ui/button";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  image?: string;
  title: string;
  description: string;
  action?: EmptyStateAction;
  steps?: string[];
}

export default function EmptyState({
  icon: Icon,
  image,
  title,
  description,
  action,
  steps,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;
  const actionContent = action ? (
    action.href ? (
      <Button render={<Link href={action.href} />} nativeButton={false}>
        {ActionIcon ? <ActionIcon size={16} strokeWidth={3} aria-hidden="true" /> : null}
        {action.label}
      </Button>
    ) : (
      <Button type="button" onClick={action.onClick}>
        {ActionIcon ? <ActionIcon size={16} strokeWidth={3} aria-hidden="true" /> : null}
        {action.label}
      </Button>
    )
  ) : null;

  return (
    <FadeIn animation="fadeInUp" className="flex flex-col items-center justify-center py-[var(--space-7)] px-[var(--space-6)]">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-[var(--space-5)]">
          {image ? (
            <Image
              src={image}
              alt={title}
              className="size-48 object-contain"
              width={800}
              height={800}
              unoptimized
            />
          ) : Icon ? (
            <div className="flex size-16 items-center justify-center rounded-[var(--radius-object)] bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
              <Icon
                size={32}
                className="text-[var(--utility-icon)]"
                strokeWidth={1.5}
              />
            </div>
          ) : null}
        </div>

        <h3 className="product-section-title mb-[var(--space-2)] text-[var(--text-primary)]">
          {title}
        </h3>

        <p className="mb-[var(--space-5)] text-[length:var(--text-body)] leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>

        {steps && steps.length > 0 && (
          <div className="mb-[var(--space-5)] flex flex-wrap items-center justify-center gap-[var(--space-2)]">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center gap-[var(--space-2)]">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--selection-bg)] text-[length:var(--text-caption)] font-semibold text-[var(--selection-text)]">
                    {index + 1}
                  </span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-secondary)]">
                    {step}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight
                    size={14}
                    className="text-[var(--border-default)]"
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {actionContent}
      </div>
    </FadeIn>
  );
}

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-[var(--control-sm)] w-fit shrink-0 items-center justify-center gap-[var(--space-1)] overflow-hidden rounded-[var(--radius-pill)] border border-transparent px-[var(--space-2)] py-0 text-[length:var(--text-caption)] font-medium whitespace-nowrap transition-all duration-[var(--duration-default)] ease-[var(--ease-product)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        neutral:
          "border border-[var(--neutral-border)] bg-[var(--neutral-bg)] text-[var(--neutral-text)]",
        success:
          "border border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)]",
        warning:
          "border border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]",
        danger:
          "border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]",
        info:
          "border border-[var(--info-border)] bg-[var(--info-bg)] text-[var(--info-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge }

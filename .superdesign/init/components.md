# Shared UI primitives

Source: `app/src/components/ui/` plus layout stand-ins where shadcn-style **Card**, **Avatar**, and **Tabs** do not exist.

Stack: React 19 + Base UI (`@base-ui/react`) + `class-variance-authority` + Tailwind v4 token classes. Helpers via `app/src/lib/utils.ts` (`cn`).

## Inventory (`app/src/components/ui/`)

| File | Role |
|---|---|
| `app/src/components/ui/button.tsx` | Button (CVA variants) |
| `app/src/components/ui/input.tsx` | Text input |
| `app/src/components/ui/textarea.tsx` | Textarea |
| `app/src/components/ui/label.tsx` | Form label |
| `app/src/components/ui/badge.tsx` | Badge |
| `app/src/components/ui/select.tsx` | Select |
| `app/src/components/ui/dialog.tsx` | Dialog (desktop modal / mobile sheet) |
| `app/src/components/ui/dropdown-menu.tsx` | Dropdown menu |
| `app/src/components/ui/sheet.tsx` | Sheet / drawer |
| `app/src/components/ui/tooltip.tsx` | Tooltip + TooltipProvider |
| `app/src/components/ui/skeleton.tsx` | Skeleton |
| `app/src/components/ui/EmptyState.tsx` | Empty state |
| `app/src/components/ui/ConfirmDialog.tsx` | Confirm dialog |
| `app/src/components/ui/StatusBadge.tsx` | Product status pill |
| `app/src/components/ui/table.tsx` | Table primitives |
| `app/src/components/ui/sonner.tsx` | Toaster (sonner) |
| `app/src/components/ui/ThemeToggle.tsx` | Light/dark toggle (root layout forces dark) |
| `app/src/components/ui/LanguageSwitcher.tsx` | Locale switcher |
| `app/src/components/ui/contextual-help.tsx` | Help tooltip button |
| `app/src/components/ui/loader-tetris.tsx` | Tetris loader |
| `app/src/components/ui/image-cursor-trail.tsx` | Decorative cursor trail |

**Not present as shared primitives:** `Card`, `Avatar`, `Tabs`. Stand-ins used in production:

- **Card** → `app/src/components/layout/Panel.tsx`
- **Tabs** → `app/src/components/layout/ResponsiveTabs.tsx`
- **Avatar** → inline initials circle in `app/src/components/layout/AppSidebar.tsx` / `TopBar.tsx` (no `Avatar` component)

The 15 dumps below are the most-used primitives (including those stand-ins). Remaining UI files are listed in the inventory only.

---

## 1. Button

### `app/src/components/ui/button.tsx`

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-clip-padding text-[length:var(--text-body)] font-medium whitespace-nowrap transition-all duration-[var(--duration-default)] ease-[var(--ease-product)] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.97] active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-busy:opacity-70 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--action-primary-bg)] text-[var(--action-primary-text)] [a]:hover:bg-[var(--action-primary-hover)]",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-[var(--active-navigation-text)] underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--control-md)] gap-[var(--space-2)] px-[var(--space-3)] has-data-[icon=inline-end]:pr-[var(--space-2)] has-data-[icon=inline-start]:pl-[var(--space-2)]",
        xs: "h-[var(--control-sm)] gap-[var(--space-1)] rounded-[var(--radius-control)] px-[var(--space-2)] text-[length:var(--text-caption)] in-data-[slot=button-group]:rounded-[var(--radius-control)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--control-sm)] gap-[var(--space-1)] rounded-[var(--radius-control)] px-[var(--space-3)] text-[length:var(--text-label)] in-data-[slot=button-group]:rounded-[var(--radius-control)] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[var(--control-lg)] gap-[var(--space-2)] px-[var(--space-3)] has-data-[icon=inline-end]:pr-[var(--space-2)] has-data-[icon=inline-start]:pl-[var(--space-2)]",
        icon: "size-[var(--control-md)]",
        "icon-xs":
          "size-[var(--control-sm)] rounded-[var(--radius-control)] in-data-[slot=button-group]:rounded-[var(--radius-control)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-[var(--control-sm)] rounded-[var(--radius-control)] in-data-[slot=button-group]:rounded-[var(--radius-control)]",
        "icon-lg": "size-[var(--control-lg)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }
```


## 2. Input

### `app/src/components/ui/input.tsx`

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[var(--control-md)] w-full min-w-0 rounded-[var(--radius-control)] border border-input bg-transparent px-[var(--space-3)] py-[var(--space-1)] text-[length:var(--text-body-lg)] transition-all duration-[var(--duration-default)] ease-[var(--ease-product)] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[length:var(--text-body)] file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-[length:var(--text-body)] dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
```


## 3. Card → Panel

No `Card` in `app/src/components/ui/`. Surfaces use `Panel` (bordered `surface-base` + `radius-object`).

### `app/src/components/layout/Panel.tsx`

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function Panel({
  children,
  className,
  padding = "none",
}: {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md";
}) {
  const paddingClass =
    padding === "md" ? "p-6" : padding === "sm" ? "p-3" : undefined;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--radius-object)] border border-[var(--border-dim)] bg-[var(--surface-base)]",
        paddingClass,
        className,
      )}
    >
      {children}
    </div>
  );
}
```


## 4. Dialog

### `app/src/components/ui/dialog.tsx`

```tsx
"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-[var(--layer-backdrop)] bg-black/40 duration-[var(--duration-default)] supports-backdrop-filter:backdrop-blur-xs",
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        "motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
        className
      )}
      {...props}
    />
  )
}

const dialogContentVariants = cva(
  [
    "fixed z-[var(--layer-overlay)] flex w-full flex-col overflow-hidden bg-[var(--surface-overlay)] text-[length:var(--text-body)] text-popover-foreground ring-1 ring-border outline-none shadow-[var(--shadow-overlay)]",
    "max-h-[min(calc(100dvh-2rem),720px)]",
    "duration-[var(--duration-default)] ease-[var(--ease-emphasized)]",
    "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
    "motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
    // Desktop: centered modal
    "sm:top-1/2 sm:left-1/2 sm:max-w-[calc(100%-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-overlay)]",
    "sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95",
    "motion-reduce:sm:data-open:zoom-in-100 motion-reduce:sm:data-closed:zoom-out-100",
    // Mobile: bottom sheet
    "max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:max-h-[90dvh] max-sm:rounded-t-[var(--radius-overlay)] max-sm:rounded-b-none",
    "max-sm:data-open:slide-in-from-bottom-4 max-sm:data-closed:slide-out-to-bottom-4",
    "motion-reduce:max-sm:data-open:slide-in-from-bottom-0 motion-reduce:max-sm:data-closed:slide-out-to-bottom-0",
  ],
  {
    variants: {
      size: {
        sm: "sm:max-w-sm",
        md: "sm:max-w-lg",
        lg: "sm:max-w-2xl",
        xl: "sm:max-w-4xl",
        full: "inset-0 h-dvh max-h-dvh rounded-none sm:inset-4 sm:h-[calc(100dvh-2rem)] sm:max-h-none sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-[var(--radius-overlay)]",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
)

function DialogContent({
  className,
  children,
  showCloseButton = true,
  size = "sm",
  ...props
}: DialogPrimitive.Popup.Props &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean
  }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(dialogContentVariants({ size }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 z-[var(--layer-raised)]"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "shrink-0 border-b border-[var(--border-subtle)] px-[var(--space-4)] py-[var(--space-4)] pr-12",
        className
      )}
      {...props}
    />
  )
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("flex-1 overflow-y-auto px-4 py-4", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "shrink-0 flex flex-col-reverse gap-[var(--space-2)] border-t border-[var(--border-subtle)] bg-muted/50 p-[var(--space-4)] sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
```


## 5. Select

### `app/src/components/ui/select.tsx`

```tsx
"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"

const Select = SelectPrimitive.Root

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-control)] border border-input bg-transparent py-[var(--space-2)] pr-[var(--space-2)] pl-[var(--space-3)] text-[length:var(--text-body)] whitespace-nowrap transition-colors duration-[var(--duration-default)] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-[var(--control-md)] data-[size=sm]:h-[var(--control-sm)] data-[size=sm]:rounded-[var(--radius-control)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-[var(--space-2)] dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-[var(--layer-popover)]"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn("relative isolate z-[var(--layer-popover)] max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[var(--radius-overlay)] bg-[var(--surface-overlay)] text-popover-foreground shadow-[var(--shadow-floating)] ring-1 ring-border duration-[var(--duration-fast)] data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-[var(--layer-raised)] flex w-full cursor-default items-center justify-center bg-popover py-[var(--space-1)] [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-[var(--layer-raised)] flex w-full cursor-default items-center justify-center bg-popover py-[var(--space-1)] [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
```


## 6. Tabs → ResponsiveTabs

No Radix/Base UI `Tabs`. Settings/library-style tab bars use this controlled underline nav.

### `app/src/components/layout/ResponsiveTabs.tsx`

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type ResponsiveTabItem = {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
};

export default function ResponsiveTabs({
  items,
  activeId,
  onSelect,
  ariaLabel,
  className,
}: {
  items: ResponsiveTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-[var(--border-dim)]", className)}>
      <nav
        aria-label={ariaLabel}
        className="-mb-px flex gap-1 overflow-x-auto pb-px [scrollbar-width:thin]"
      >
        {items.map((item) => {
          const active = item.id === activeId;
          const disabled = item.disabled === true;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!disabled) onSelect(item.id);
              }}
              disabled={disabled}
              aria-pressed={active}
              aria-disabled={disabled || undefined}
              className={cn(
                "relative shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-200",
                disabled
                  ? "cursor-not-allowed opacity-50 text-[var(--text-muted)]"
                  : active
                    ? "text-[var(--selection-text)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <span className="flex items-center gap-2">
                {item.label}
                {item.badge}
              </span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--selection-border)]"
                />
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
```


## 7. Badge

### `app/src/components/ui/badge.tsx`

```tsx
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-[var(--control-sm)] w-fit shrink-0 items-center justify-center gap-[var(--space-1)] overflow-hidden rounded-[var(--radius-pill)] border border-transparent px-[var(--space-2)] py-0 text-[length:var(--text-caption)] font-medium whitespace-nowrap transition-all duration-[var(--duration-default)] ease-[var(--ease-product)] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border border-[var(--selection-border)] bg-[var(--selection-bg)] text-[var(--selection-text)] [a]:hover:bg-[var(--selection-bg)]",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-[var(--active-navigation-text)] underline-offset-4 hover:underline",
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
```


## 8. Avatar (inline pattern — no primitive)

There is no `app/src/components/ui/avatar.tsx`. Account identity is a 30px initials disc in the sidebar (and a similar `DropdownMenuTrigger` in `app/src/components/layout/TopBar.tsx`).

```tsx
// From app/src/components/layout/AppSidebar.tsx (account row)
<Link
  href="/dashboard"
  className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-2 transition-colors hover:bg-[var(--surface-base)]"
>
  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[var(--selection-bg)] text-xs font-bold text-[var(--selection-text)]">
    {initials}
  </span>
  {/* displayName + plan/credits */}
</Link>
```

Initials are derived from session name / first+last / email, sliced to two uppercase letters, fallback `"U"`.

## 9. Textarea

### `app/src/components/ui/textarea.tsx`

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[var(--radius-control)] border border-input bg-transparent px-[var(--space-3)] py-[var(--space-2)] text-[length:var(--text-body-lg)] transition-colors duration-[var(--duration-default)] ease-[var(--ease-product)] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-[length:var(--text-body)] dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
```


## 10. Dropdown

### `app/src/components/ui/dropdown-menu.tsx`

```tsx
"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-[var(--layer-popover)] outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn("z-[var(--layer-popover)] max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-[var(--radius-overlay)] bg-[var(--surface-overlay)] p-[var(--space-1)] text-popover-foreground shadow-[var(--shadow-floating)] ring-1 ring-foreground/10 duration-[var(--duration-fast)] outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95", className )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto min-w-[96px] rounded-[var(--radius-overlay)] bg-[var(--surface-overlay)] p-[var(--space-1)] text-popover-foreground shadow-[var(--shadow-floating)] ring-1 ring-foreground/10 duration-[var(--duration-fast)] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon
          />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon
          />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
```


## 11. Label

### `app/src/components/ui/label.tsx`

```tsx
"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return React.createElement("label", {
    "data-slot": "label",
    className: cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
    ),
    ...props,
  })
}

export { Label }
```


## 12. Sheet

### `app/src/components/ui/sheet.tsx`

```tsx
"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 isolate z-[var(--layer-backdrop)] bg-black/40 duration-[var(--duration-default)] supports-backdrop-filter:backdrop-blur-xs",
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        "motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
        className
      )}
      {...props}
    />
  )
}

const sheetContentVariants = cva(
  [
    "fixed z-[var(--layer-overlay)] flex flex-col overflow-hidden bg-[var(--surface-overlay)] text-[length:var(--text-body)] text-popover-foreground ring-1 ring-border outline-none shadow-[var(--shadow-overlay)]",
    "duration-[var(--duration-slow)] ease-[var(--ease-emphasized)]",
    "data-open:animate-in data-closed:animate-out",
    "motion-reduce:duration-0 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none",
  ],
  {
    variants: {
      side: {
        right: [
          "inset-y-0 right-0 h-full border-l",
          "data-open:slide-in-from-right data-closed:slide-out-to-right",
          "motion-reduce:data-open:slide-in-from-right-0 motion-reduce:data-closed:slide-out-to-right-0",
          // Mobile: full width
          "w-full max-sm:inset-0 max-sm:h-full max-sm:max-w-none",
        ],
        bottom: [
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-[var(--radius-overlay)] border-t",
          "data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
          "motion-reduce:data-open:slide-in-from-bottom-0 motion-reduce:data-closed:slide-out-to-bottom-0",
        ],
      },
      size: {
        md: "sm:w-[480px]",
        lg: "sm:w-[640px]",
        xl: "sm:w-[800px]",
      },
    },
    defaultVariants: {
      side: "right",
      size: "md",
    },
  }
)

function SheetContent({
  className,
  children,
  showCloseButton = true,
  side = "right",
  size = "md",
  ...props
}: DialogPrimitive.Popup.Props &
  VariantProps<typeof sheetContentVariants> & {
    showCloseButton?: boolean
  }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(sheetContentVariants({ side, size }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 z-[var(--layer-raised)]"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "shrink-0 border-b border-[var(--border-subtle)] px-[var(--space-4)] py-[var(--space-4)] pr-12",
        className
      )}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("flex-1 overflow-y-auto px-4 py-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "shrink-0 flex flex-col-reverse gap-[var(--space-2)] border-t border-[var(--border-subtle)] bg-muted/50 p-[var(--space-4)] sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
```


## 13. Tooltip

### `app/src/components/ui/tooltip.tsx`

```tsx
"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[var(--layer-popover)]"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-[var(--layer-popover)] inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-[var(--space-2)] rounded-[var(--radius-control)] bg-foreground px-[var(--space-3)] py-1.5 text-[length:var(--text-caption)] text-background shadow-[var(--shadow-floating)] has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-[var(--layer-raised)] **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-[var(--layer-popover)] size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[var(--radius-sm)] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```


## 14. Skeleton

### `app/src/components/ui/skeleton.tsx`

```tsx
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion"

interface SkeletonProps extends React.ComponentProps<"div"> {
  shimmer?: boolean
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  const reducedMotion = useReducedMotion()

  if (shimmer && !reducedMotion) {
    return (
      <div
        data-slot="skeleton"
        className={cn(
          "relative overflow-hidden rounded-[var(--radius-panel)] bg-[var(--surface-inset)]",
          className
        )}
        {...props}
      >
        <div
          className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[var(--text-muted)]/10 to-transparent"
          aria-hidden="true"
        />
      </div>
    )
  }

  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-[var(--radius-panel)] bg-[var(--surface-inset)] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
```


## 15. EmptyState

### `app/src/components/ui/EmptyState.tsx`

```tsx
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
```


---

## Related (not dumped)

- `app/src/components/ui/ConfirmDialog.tsx` — destructive confirm wrapping Dialog + Button
- `app/src/components/ui/StatusBadge.tsx` — campaign/work status tokens
- `app/src/components/ui/table.tsx` — table/thead/tbody/row/cell
- `app/src/components/ui/sonner.tsx` — themed Toaster
- `app/src/components/layout/AccountStatusBadge.tsx` — demo/tester pill

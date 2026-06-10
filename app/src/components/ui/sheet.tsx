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
        "fixed inset-0 isolate z-50 bg-black/40 duration-200 supports-backdrop-filter:backdrop-blur-xs",
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
    "fixed z-50 flex flex-col overflow-hidden bg-popover text-sm text-popover-foreground ring-1 ring-border outline-none",
    "duration-300 ease-[cubic-bezier(0.19,1,0.22,1)]",
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
          "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-xl border-t",
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
                className="absolute top-2 right-2 z-10"
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
        "shrink-0 border-b border-[var(--border-dim)] px-4 py-4 pr-12",
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
        "shrink-0 flex flex-col-reverse gap-2 border-t border-[var(--border-dim)] bg-muted/50 p-4 sm:flex-row sm:justify-end",
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

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

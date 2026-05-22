"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

interface VirtualListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateSize: number;
  gap?: number;
  className?: string;
  overscan?: number;
  enabled?: boolean;
}

/**
 * VirtualList — windowing utility for long lists.
 *
 * Only enables virtualization when `enabled` is true (e.g., items.length > 50).
 * Falls back to a simple div list otherwise to avoid virtualization overhead.
 */
export default function VirtualList<T>({
  items,
  renderItem,
  estimateSize,
  gap = 0,
  className,
  overscan = 5,
  enabled = false,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
    enabled,
  });

  const virtualItems = virtualizer.getVirtualItems();

  if (!enabled) {
    return (
      <div className={cn("space-y-0", className)} style={{ gap }}>
        {items.map((item, index) => renderItem(item, index))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn("overflow-auto", className)}
      style={{ height: "calc(100vh - 200px)" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

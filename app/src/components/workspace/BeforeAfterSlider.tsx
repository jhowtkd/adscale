"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Derivation } from "@/lib/mock-data";
import { platformColors } from "@/lib/mock-data";
import { MoveHorizontal, MoveVertical } from "lucide-react";

// ============================================
// Types
// ============================================

interface BeforeAfterSliderProps {
  derivationA: Derivation;
  derivationB: Derivation;
  direction?: "horizontal" | "vertical";
}

// ============================================
// Component
// ============================================

export default function BeforeAfterSlider({
  derivationA,
  derivationB,
  direction = "horizontal",
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50); // 0-100 percentage
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isHorizontal = direction === "horizontal";

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      let pct: number;
      if (isHorizontal) {
        pct = ((clientX - rect.left) / rect.width) * 100;
      } else {
        pct = ((clientY - rect.top) / rect.height) * 100;
      }
      setPosition(Math.max(0, Math.min(100, pct)));
    },
    [isHorizontal]
  );

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX, e.clientY);
    },
    [isDragging, handleMove]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    [isDragging, handleMove]
  );

  const aspectClass =
    {
      "1:1": "aspect-square",
      "4:5": "aspect-[4/5]",
      "9:16": "aspect-[9/16]",
    }[derivationA.format ?? ""] ?? "aspect-square";

  const platformStyleA = platformColors[derivationA.platform] || {
    bg: "rgba(99,102,241,0.12)",
    text: "#818cf8",
  };
  const platformStyleB = platformColors[derivationB.platform] || {
    bg: "rgba(99,102,241,0.12)",
    text: "#818cf8",
  };

  const clipPath = isHorizontal
    ? `inset(0 ${100 - position}% 0 0)`
    : `inset(0 0 ${100 - position}% 0)`;

  const handleStyle = isHorizontal
    ? {
        left: `${position}%`,
        top: 0,
        bottom: 0,
        transform: "translateX(-50%)",
      }
    : {
        top: `${position}%`,
        left: 0,
        right: 0,
        transform: "translateY(-50%)",
      };

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden rounded-xl select-none", aspectClass)}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      {/* Background image (Derivation B - "After") */}
      <div className="absolute inset-0">
        {derivationB.imageUrl ? (
          <img
            src={derivationB.imageUrl}
            alt={derivationB.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, 
                ${platformStyleB.bg} 0%, 
                var(--surface-raised) 50%, 
                ${platformStyleB.bg} 100%)`,
            }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <span
                className="text-6xl font-bold opacity-20"
                style={{ color: platformStyleB.text }}
              >
                {derivationB.name.charAt(0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Foreground image (Derivation A - "Before") with clip */}
      <div
        className="absolute inset-0"
        style={{ clipPath }}
      >
        {derivationA.imageUrl ? (
          <img
            src={derivationA.imageUrl}
            alt={derivationA.name}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, 
                ${platformStyleA.bg} 0%, 
                var(--surface-raised) 50%, 
                ${platformStyleA.bg} 100%)`,
            }}
          >
            <div className="w-full h-full flex items-center justify-center">
              <span
                className="text-6xl font-bold opacity-20"
                style={{ color: platformStyleA.text }}
              >
                {derivationA.name.charAt(0)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Slider handle */}
      <div
        className="absolute z-10 cursor-ew-resize flex items-center justify-center"
        style={handleStyle}
        onMouseDown={handleMouseDown}
        onTouchStart={handleMouseDown}
      >
        {isHorizontal ? (
          <>
            <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
            <div className="relative z-20 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
              <MoveHorizontal size={16} className="text-[var(--text-primary)]" />
            </div>
          </>
        ) : (
          <>
            <div className="absolute left-0 right-0 h-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]" />
            <div className="relative z-20 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
              <MoveVertical size={16} className="text-[var(--text-primary)]" />
            </div>
          </>
        )}
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-20 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded">
        Antes
      </div>
      <div className="absolute top-3 right-3 z-20 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded">
        Depois
      </div>
    </div>
  );
}

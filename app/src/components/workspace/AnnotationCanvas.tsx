"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Annotation, AnnotationType } from "@/lib/mock-data";

// ============================================
// Types
// ============================================

interface AnnotationCanvasProps {
  imageUrl?: string;
  aspectRatio?: string;
  annotations: Annotation[];
  onAddAnnotation: (annotation: Annotation) => void;
  onRemoveAnnotation: (id: string) => void;
  onClearAnnotations: () => void;
  activeTool: AnnotationType | "select";
  activeColor: string;
  strokeWidth: number;
  fontSize: number;
}

interface Point {
  x: number;
  y: number;
}

// ============================================
// Helpers
// ============================================

const COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
  "#ffffff", // white
  "#000000", // black
];

function generateId(): string {
  return `anot_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getNormalizedPoint(
  e: React.MouseEvent | MouseEvent,
  canvas: HTMLCanvasElement
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  canvasWidth: number,
  canvasHeight: number
) {
  const { type, x, y, color, strokeWidth } = annotation;
  const px = x * canvasWidth;
  const py = y * canvasHeight;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (type) {
    case "freehand": {
      if (!annotation.path) return;
      const path = new Path2D(annotation.path);
      ctx.stroke(path);
      break;
    }
    case "text": {
      ctx.font = `${annotation.fontSize ?? 16}px sans-serif`;
      ctx.fillText(annotation.text ?? "", px, py);
      break;
    }
    case "circle": {
      const radius = ((annotation.width ?? 0.1) * canvasWidth) / 2;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "rectangle": {
      const w = (annotation.width ?? 0.1) * canvasWidth;
      const h = (annotation.height ?? 0.1) * canvasHeight;
      ctx.strokeRect(px - w / 2, py - h / 2, w, h);
      break;
    }
    case "arrow": {
      const endX = (annotation.endX ?? x + 0.1) * canvasWidth;
      const endY = (annotation.endY ?? y) * canvasHeight;
      drawArrow(ctx, px, py, endX, endY, strokeWidth);
      break;
    }
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number
) {
  const headLength = width * 3;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Arrow head
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLength * Math.cos(angle - Math.PI / 6),
    toY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLength * Math.cos(angle + Math.PI / 6),
    toY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

// ============================================
// Component
// ============================================

export default function AnnotationCanvas({
  imageUrl,
  aspectRatio = "1:1",
  annotations,
  onAddAnnotation,
  onRemoveAnnotation,
  onClearAnnotations,
  activeTool,
  activeColor,
  strokeWidth,
  fontSize,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [textValue, setTextValue] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const aspectClass = {
    "1:1": "aspect-square",
    "4:5": "aspect-[4/5]",
    "9:16": "aspect-[9/16]",
  }[aspectRatio] ?? "aspect-square";

  // Load background image
  useEffect(() => {
    if (!imageUrl) {
      setImageLoaded(true);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.onerror = () => {
      setImageLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Redraw canvas when annotations or image changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageLoaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw background image
    if (imageRef.current) {
      ctx.drawImage(imageRef.current, 0, 0, rect.width, rect.height);
    } else {
      // Fallback gradient background
      const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      gradient.addColorStop(0, "rgba(99,102,241,0.08)");
      gradient.addColorStop(0.5, "rgba(30,30,30,0.05)");
      gradient.addColorStop(1, "rgba(99,102,241,0.08)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    // Draw all annotations
    annotations.forEach((annotation) => {
      drawAnnotation(ctx, annotation, rect.width, rect.height);
    });

    // Draw current path (freehand in progress)
    if (currentPath) {
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const path = new Path2D(currentPath);
      ctx.stroke(path);
    }
  }, [annotations, imageLoaded, currentPath, activeColor, strokeWidth]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool === "select") return;
      const point = getNormalizedPoint(e, e.currentTarget);

      if (activeTool === "text") {
        setTextInput({
          x: e.clientX,
          y: e.clientY,
          visible: true,
        });
        setTextValue("");
        return;
      }

      setIsDrawing(true);
      setStartPoint(point);

      if (activeTool === "freehand") {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const px = point.x * rect.width;
        const py = point.y * rect.height;
        setCurrentPath(`M ${px} ${py}`);
      }
    },
    [activeTool]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || activeTool === "select" || activeTool === "text") return;
      const point = getNormalizedPoint(e, e.currentTarget);
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();

      if (activeTool === "freehand" && currentPath) {
        const px = point.x * rect.width;
        const py = point.y * rect.height;
        setCurrentPath((prev) => `${prev} L ${px} ${py}`);
      }
    },
    [isDrawing, activeTool, currentPath]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || activeTool === "select" || activeTool === "text") return;
      const point = getNormalizedPoint(e, e.currentTarget);
      setIsDrawing(false);

      const annotation: Annotation = {
        id: generateId(),
        type: activeTool,
        x: startPoint?.x ?? point.x,
        y: startPoint?.y ?? point.y,
        color: activeColor,
        strokeWidth,
      };

      if (activeTool === "freehand") {
        if (currentPath) {
          annotation.path = currentPath;
          onAddAnnotation(annotation);
        }
        setCurrentPath(null);
      } else if (activeTool === "circle") {
        const dx = point.x - (startPoint?.x ?? point.x);
        const dy = point.y - (startPoint?.y ?? point.y);
        annotation.width = Math.sqrt(dx * dx + dy * dy) * 2;
        annotation.height = annotation.width;
        onAddAnnotation(annotation);
      } else if (activeTool === "rectangle") {
        annotation.width = Math.abs(point.x - (startPoint?.x ?? point.x));
        annotation.height = Math.abs(point.y - (startPoint?.y ?? point.y));
        onAddAnnotation(annotation);
      } else if (activeTool === "arrow") {
        annotation.endX = point.x;
        annotation.endY = point.y;
        onAddAnnotation(annotation);
      }

      setStartPoint(null);
    },
    [isDrawing, activeTool, startPoint, activeColor, strokeWidth, currentPath, onAddAnnotation]
  );

  const handleTextSubmit = useCallback(() => {
    if (!textValue.trim()) {
      setTextInput({ x: 0, y: 0, visible: false });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const annotation: Annotation = {
      id: generateId(),
      type: "text",
      x: (textInput.x - rect.left) / rect.width,
      y: (textInput.y - rect.top) / rect.height,
      color: activeColor,
      strokeWidth,
      text: textValue.trim(),
      fontSize,
    };

    onAddAnnotation(annotation);
    setTextInput({ x: 0, y: 0, visible: false });
    setTextValue("");
  }, [textValue, textInput, activeColor, strokeWidth, fontSize, onAddAnnotation]);

  return (
    <div ref={containerRef} className={cn("relative", aspectClass)}>
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 w-full h-full rounded-xl",
          activeTool !== "select" && "cursor-crosshair"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Text input overlay */}
      {textInput.visible && (
        <div
          className="absolute z-50 flex items-center gap-2 bg-[var(--surface-base)] border border-[var(--border-dim)] rounded-lg p-2 shadow-lg"
          style={{
            left: textInput.x,
            top: textInput.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <input
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTextSubmit();
              if (e.key === "Escape") {
                setTextInput({ x: 0, y: 0, visible: false });
                setTextValue("");
              }
            }}
            placeholder="Digite o texto..."
            className="h-8 px-2 text-sm bg-transparent text-[var(--text-primary)] border border-[var(--border-dim)] rounded focus:border-[var(--accent-mint)] focus:outline-none w-40"
            autoFocus
          />
          <button
            onClick={handleTextSubmit}
            className="px-2 py-1 text-xs font-medium bg-[var(--accent-mint)] text-white rounded hover:bg-[var(--accent-mint-light)]"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}

export { COLORS };
export type { AnnotationCanvasProps };

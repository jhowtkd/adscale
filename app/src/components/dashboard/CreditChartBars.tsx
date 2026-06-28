"use client";

import { useId, useMemo, useState } from "react";

interface DataPoint {
  date: string;
  used: number;
  remaining: number;
}

interface CreditChartBarsProps {
  data: DataPoint[];
  range: "7" | "30" | "90";
  locale: string;
  maxValue: number;
}

function formatTick(date: string, range: CreditChartBarsProps["range"], locale: string): string {
  const isWeekly = range === "90";
  return new Date(date).toLocaleDateString(locale, {
    ...(isWeekly
      ? { month: "short", day: "numeric" }
      : { weekday: range === "7" ? "short" : undefined, day: "numeric" }),
  });
}

function tickInterval(range: CreditChartBarsProps["range"], index: number): boolean {
  if (range === "30") return index % 5 === 0;
  if (range === "90") return index % 2 === 0;
  return true;
}

export default function CreditChartBars({
  data,
  range,
  locale,
  maxValue,
}: CreditChartBarsProps) {
  const gradientId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    const width = 100;
    const height = 100;
    const padding = { top: 4, right: 2, bottom: 18, left: 2 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const barGap = 0.25;
    const barWidth = innerW / data.length;
    const bars = data.map((point, index) => {
      const barH = maxValue > 0 ? (point.used / maxValue) * innerH : 0;
      const x = padding.left + index * barWidth + barWidth * barGap * 0.5;
      const w = barWidth * (1 - barGap);
      const y = padding.top + innerH - barH;
      return { ...point, index, x, y, w, h: barH };
    });
    return { width, height, padding, innerH, bars, barWidth };
  }, [data, maxValue]);

  const active = activeIndex !== null ? chart.bars[activeIndex] : null;

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-full w-full"
        role="img"
        aria-label="Credit usage chart"
        onMouseLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-green)" stopOpacity={0.9} />
            <stop offset="100%" stopColor="var(--accent-green)" stopOpacity={0.65} />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = chart.padding.top + chart.innerH * (1 - fraction);
          return (
            <line
              key={fraction}
              x1={chart.padding.left}
              x2={chart.width - chart.padding.right}
              y1={y}
              y2={y}
              stroke="var(--border-dim)"
              strokeDasharray="1 1"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {chart.bars.map((bar) => (
          <rect
            key={bar.date}
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={Math.max(bar.h, 0)}
            rx={0.8}
            fill={`url(#${gradientId})`}
            opacity={activeIndex === null || activeIndex === bar.index ? 0.9 : 0.45}
            onMouseEnter={() => setActiveIndex(bar.index)}
          />
        ))}

        {chart.bars.map(
          (bar) =>
            tickInterval(range, bar.index) && (
              <text
                key={`tick-${bar.date}`}
                x={bar.x + bar.w / 2}
                y={chart.height - 4}
                textAnchor="middle"
                fontSize={3.2}
                fill="var(--text-secondary)"
              >
                {formatTick(bar.date, range, locale)}
              </text>
            ),
        )}
      </svg>

      {active && active.used > 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-[var(--border-dim)] bg-[var(--surface-base)] px-2 py-1 text-xs shadow-sm"
          style={{
            left: `${((active.x + active.w / 2) / chart.width) * 100}%`,
            top: "8%",
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-medium text-[var(--text-primary)]">
            {formatTick(active.date, range, locale)}
          </p>
          <p className="text-[var(--text-secondary)]">{active.used} used</p>
        </div>
      )}
    </div>
  );
}

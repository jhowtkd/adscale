"use client";

import type { ReactNode } from "react";
import ImageCursorTrail from "@/components/ui/image-cursor-trail";
import { studioChromeBarClass } from "@/components/dashboard/studio-stage/StudioInstrument";
import { cn } from "@/lib/utils";
import styles from "./StudioStage.module.css";

export type StageMosaicItem = {
  id: string;
  title: string;
  src: string;
  format?: string | null;
  detail?: string;
};

const WORK_MOSAIC = [
  { className: "left-[2%] top-[6%] z-[1] w-[38%] rotate-[-3deg]", srcIndex: 0 },
  { className: "right-[4%] top-[4%] z-[2] w-[34%] rotate-[4deg]", srcIndex: 1 },
  { className: "left-[28%] top-[18%] z-[3] w-[44%] rotate-[-1deg]", srcIndex: 2 },
  { className: "left-[6%] bottom-[18%] z-[2] w-[30%] rotate-[2deg]", srcIndex: 3 },
  { className: "right-[8%] bottom-[16%] z-[4] w-[36%] rotate-[-4deg]", srcIndex: 4 },
  { className: "left-[42%] bottom-[8%] z-[1] w-[24%] rotate-[3deg]", srcIndex: 5 },
];

const EMPTY_EDGES = [
  { className: "left-[-18%] top-[4%] w-[46%] max-w-md rotate-[-7deg]", srcIndex: 0 },
  { className: "right-[-20%] top-[8%] w-[42%] max-w-md rotate-[6deg]", srcIndex: 1 },
  { className: "left-[-16%] bottom-[-6%] w-[40%] max-w-sm rotate-[4deg]", srcIndex: 2 },
  { className: "right-[-18%] bottom-[-8%] w-[44%] max-w-md rotate-[-5deg]", srcIndex: 3 },
];

function mosaicAspect(format?: string | null) {
  if (format === "1:1" || format === "4:5" || format === "9:16") return format.replace(":", " / ");
  return null;
}

function WorkMosaic({
  items,
  onSelect,
  repeatItems = true,
}: {
  items: StageMosaicItem[];
  onSelect?: (item: StageMosaicItem) => void;
  repeatItems?: boolean;
}) {
  return (
    <div data-testid="studio-mosaic" className="absolute inset-0 overflow-hidden">
      {WORK_MOSAIC.map((tile) => {
        const image = repeatItems ? items[tile.srcIndex % Math.max(items.length, 1)] : items[tile.srcIndex];
        if (!image) return null;
        const aspect = mosaicAspect(image.format);
        return (
          <button
            key={tile.className}
            type="button"
            aria-label={image.title}
            onClick={() => onSelect?.(image)}
            className={cn(
              "absolute overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] motion-reduce:rotate-0",
              "transition-transform duration-[280ms] ease-[var(--ease-out-expo)] hover:-translate-y-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              tile.className,
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.src}
              alt=""
              className={cn("w-full", repeatItems || !aspect ? "aspect-[4/5] object-cover" : "object-contain")}
              style={repeatItems || !aspect ? undefined : { aspectRatio: aspect }}
            />
            {image.detail ? (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-[10px] font-medium text-white">
                {image.detail}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function EdgeField({
  items,
  onSelect,
}: {
  items: StageMosaicItem[];
  onSelect?: (item: StageMosaicItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div data-testid="studio-mosaic" className="pointer-events-none absolute inset-0 overflow-hidden">
      {EMPTY_EDGES.map((tile) => {
        const image = items[tile.srcIndex % items.length];
        if (!image) return null;
        return (
          <button
            key={tile.className}
            type="button"
            aria-label={image.title}
            onClick={() => onSelect?.(image)}
            className={cn(
              "pointer-events-auto absolute overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface-raised)] motion-reduce:rotate-0",
              "opacity-70 transition-[opacity,transform] duration-[280ms] ease-[var(--ease-out-expo)] hover:opacity-100 hover:-translate-y-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
              tile.className,
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} alt="" className="aspect-[4/5] w-full object-cover" />
          </button>
        );
      })}
    </div>
  );
}

export function BrandStageHome({
  occupancy,
  brandName,
  headline,
  subtitle,
  eyebrow,
  mosaicItems,
  onSelectMosaic,
  continueWork,
  topBar,
  talkBox,
  children,
  onDropFiles,
  dropLabel,
  expanded = false,
  onCollapse,
  results,
  deskControls,
  repeatItems = true,
  resultsActive = false,
}: {
  occupancy: "empty" | "work";
  brandName: string | null;
  headline: string;
  subtitle: string;
  eyebrow: string;
  mosaicItems: StageMosaicItem[];
  onSelectMosaic?: (item: StageMosaicItem) => void;
  continueWork?: ReactNode;
  topBar: ReactNode;
  talkBox: ReactNode;
  children?: ReactNode;
  onDropFiles: (files: FileList | File[] | null) => void;
  dropLabel: string;
  expanded?: boolean;
  onCollapse?: () => void;
  results?: ReactNode;
  deskControls?: ReactNode;
  repeatItems?: boolean;
  resultsActive?: boolean;
}) {
  const empty = occupancy === "empty";
  const showInspirationField = empty && repeatItems;
  const trailItems = mosaicItems.map((item) => item.src).filter(Boolean);

  return (
    <div
      data-testid="studio-stage"
      role="group"
      aria-label={dropLabel}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void onDropFiles(event.dataTransfer.files);
      }}
      className={cn("relative px-4 pb-8 sm:px-6", styles.stage)}
    >
      <div data-testid="studio-chrome-bar" className={studioChromeBarClass}>
        <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{eyebrow}</p>
        <div className="min-w-0 max-w-full">{topBar}</div>
      </div>

      <div
        className={styles.workspace}
        data-empty={empty ? "true" : "false"}
        data-expanded={expanded ? "true" : "false"}
        data-results={resultsActive ? "true" : "false"}
      >
        <div data-testid="studio-desk" className={styles.desk} inert={expanded}>
          {deskControls}
          {continueWork ? (
            <div data-testid="continue-work-suggestion" className="relative z-20 mt-6 flex justify-center">
              {continueWork}
            </div>
          ) : null}
          {showInspirationField ? (
            <>
              {trailItems.length > 0 ? (
                <ImageCursorTrail
                  items={trailItems}
                  className="absolute inset-0"
                  imgClassName="h-48 w-36 rounded-2xl"
                  maxNumberOfImages={4}
                  fadeAnimation
                  distance={14}
                />
              ) : null}
              <EdgeField items={mosaicItems} onSelect={onSelectMosaic} />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--canvas)_18%,oklch(0.145_0.004_260_/_0.72)_48%,transparent_78%)]"
              />
            </>
          ) : (
            <>
              <WorkMosaic items={mosaicItems} onSelect={onSelectMosaic} repeatItems={repeatItems} />
              {empty ? null : <h1 className="sr-only">{brandName ? headline : eyebrow}</h1>}
            </>
          )}
        </div>
        {empty ? (
          <div className={styles.intro} inert={expanded}>
            <h1 className="max-w-lg text-center text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-4xl">
              {headline}
            </h1>
            <p className="mt-3 max-w-md text-center text-sm text-[var(--text-secondary)]">{subtitle}</p>
          </div>
        ) : null}
        {expanded ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={styles.backdrop}
            onClick={onCollapse}
          />
        ) : null}
        <div data-testid="studio-dock" className={styles.dock}>{talkBox}</div>
      </div>
      <div data-testid="studio-results-surface">{results}{children}</div>
    </div>
  );
}

"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Paperclip, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { ShineBorder, SHINE_COLORS } from "@/components/ui/shine-border";
import { StudioEntryInterview } from "@/components/creative-work/StudioEntryInterview";
import type { ComposerIntent } from "@/components/creative-work/useCreativeComposer";
import type { CreativeSourceUsage } from "@/lib/hooks/use-creative-work";
import { hasCreativeWorkProtocolSourceShape } from "@/lib/creative-work-protocol-eligibility";
import type { EntryChip, EntryLocale, EntrySlot } from "@/lib/studio/entry-types";
import { shouldHideProtocolSwitcher } from "@/lib/studio/detect-entry-gaps";
import { cn } from "@/lib/utils";
import { ProtocolRadios } from "./ProtocolRadios";
import styles from "./StudioStage.module.css";

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
const MAX_ATTACHMENTS = 3;

export type TalkBoxSource = {
  id: string;
  name: string;
  previewUrl: string | null;
  usage?: CreativeSourceUsage;
};

export function TalkBox({
  placement,
  request,
  onRequestChange,
  onRequestFocusChange,
  intent,
  onSelectIntent,
  suggestedProtocol = null,
  carouselEnabled = false,
  sources,
  bufferedFile = null,
  onAddFiles,
  error,
  announcement = null,
  retryInitialTemplate = null,
  onGenerate,
  queued = false,
  generateLabel,
  interview = null,
  expanded = false,
  onExpandedChange,
  children,
  summary,
  requestRef,
  primaryActionRef,
  expansionButtonRef,
  showRequest = true,
  showAttachments = true,
  showGenerate = true,
}: {
  placement: "center" | "dock";
  request: string;
  onRequestChange: (value: string) => void;
  onRequestFocusChange?: (focused: boolean) => void;
  intent: ComposerIntent;
  onSelectIntent: (intent: ComposerIntent, immediate?: boolean) => void;
  suggestedProtocol?: ComposerIntent | null;
  carouselEnabled?: boolean;
  sources: TalkBoxSource[];
  bufferedFile?: File | null;
  onAddFiles: (files: FileList | File[] | null) => void;
  error: string | null;
  announcement?: string | null;
  retryInitialTemplate?: (() => void) | null;
  onGenerate: () => void;
  queued?: boolean;
  generateLabel: string;
  interview?: {
    enabled: boolean;
    chips: EntryChip[];
    answers: Partial<Record<EntrySlot, string>>;
    locale: EntryLocale;
    writtenToken: number;
    onSelect: (slot: EntrySlot, value: string) => void;
    continueLabel?: string;
    onContinue?: () => void;
    showContinue?: boolean;
  } | null;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  children?: ReactNode;
  summary?: ReactNode;
  requestRef?: RefObject<HTMLTextAreaElement | null>;
  primaryActionRef?: RefObject<HTMLButtonElement | null>;
  expansionButtonRef?: RefObject<HTMLButtonElement | null>;
  showRequest?: boolean;
  showAttachments?: boolean;
  showGenerate?: boolean;
}) {
  const t = useTranslations("dashboard.home");
  const tComposer = useTranslations("dashboard.home.composer");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const internalToggleRef = useRef<HTMLButtonElement>(null);
  const toggleRef = expansionButtonRef ?? internalToggleRef;
  const controlsId = useId();
  const [fidelityError, setFidelityError] = useState<string | null>(null);
  const centered = placement === "center";
  const attachCount = sources.length + (bufferedFile && sources.length === 0 ? 1 : 0);
  const needsReference = intent === "variations" || intent === "format_adaptation";
  const restylePairReady = hasCreativeWorkProtocolSourceShape({
    intent: "restyle",
    request,
    sources: sources.flatMap((source) => source.usage
      ? [{ sourceId: source.id, usage: source.usage }]
      : []),
  });
  const needsRestylePair = intent === "restyle" && !restylePairReady;
  const attachRequired = (needsReference && attachCount === 0) || needsRestylePair;
  const attachLabel = attachCount > 0
    ? t("talkAttachCount", { count: attachCount })
    : needsReference || intent === "restyle"
      ? t("talkAttachReference")
      : t("talkAttach");
  const visibleError = fidelityError ?? error;

  const generate = () => {
    if (!request.trim() && intent !== "variations" && intent !== "format_adaptation" && intent !== "restyle") {
      setFidelityError(t("emptyRequestError"));
      return;
    }
    if (needsReference && attachCount === 0) {
      setFidelityError(t("variationsReferenceError"));
      return;
    }
    if (needsRestylePair) {
      setFidelityError(t("restylePairError"));
      return;
    }
    setFidelityError(null);
    onGenerate();
  };

  const hideProtocolSwitcher = shouldHideProtocolSwitcher(interview, {
    placement,
    suggestedProtocol,
    intent,
    hasStartedRequest: expanded || Boolean(bufferedFile) || sources.length > 0,
  });
  const hideGenerateWhileInterviewOwnsEntry = shouldHideProtocolSwitcher(interview);
  const showToggle = Boolean(onExpandedChange) && (expanded || !centered);
  const collapse = () => {
    onExpandedChange?.(false);
    const restore = centered ? requestRef?.current : toggleRef.current;
    restore?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!expanded) return;
    const top = window.scrollY;
    const node = toggleRef.current;
    const active = document.activeElement;
    if (
      node
      && (active === node || active === document.body || active === document.documentElement)
    ) {
      node.focus({ preventScroll: true });
    }
    if (window.scrollY !== top) window.scrollTo({ left: 0, top, behavior: "instant" });
  }, [expanded, toggleRef]);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented || !expanded) return;
    if (!event.currentTarget.contains(event.target as Node)) return;
    if (event.target instanceof HTMLSelectElement) return;
    if (document.querySelector('[data-slot="tooltip-content"][data-open], [role="dialog"][data-open], [role="listbox"][data-open], [role="menu"][data-open]')) return;
    event.preventDefault();
    collapse();
  };

  return (
    <ShineBorder
      borderRadius={28}
      borderWidth={1}
      duration={28}
      color={[...SHINE_COLORS]}
      className={cn("h-auto w-full min-w-0", !centered && "flex flex-[0_0_auto] flex-col")}
    >
      <div
        data-testid="studio-talk-box"
        data-placement={placement}
        data-expanded={expanded ? "true" : "false"}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative glass-backdrop rounded-[1.75rem] border border-white/10",
          styles.talkBox,
          expanded ? "bg-[var(--surface-base)]" : null,
          centered ? "p-5 sm:p-6 shadow-[var(--shadow-overlay)]" : "px-4 py-3 sm:px-5 sm:py-3.5",
        )}
      >
        {showToggle || (!expanded && summary) ? (
          <div className="flex min-w-0 items-center gap-3">
            {showToggle ? (
              <button
                ref={toggleRef}
                type="button"
                aria-expanded={expanded}
                aria-controls={controlsId}
                onClick={() => expanded ? collapse() : onExpandedChange?.(true)}
                className={cn(
                  "shrink-0 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  focus,
                )}
              >
                {t(expanded ? "studioDesk.collapse" : "studioDesk.expand")}
              </button>
            ) : null}
            {!expanded && summary ? (
              <div className="min-w-0 flex-1 truncate">{summary}</div>
            ) : null}
          </div>
        ) : null}

        <div className={styles.body}>
        {hideProtocolSwitcher ? null : (
          <ProtocolRadios
            selected={intent}
            suggested={suggestedProtocol}
            carouselEnabled={carouselEnabled}
            onSelect={(next) => onSelectIntent(next, true)}
          />
        )}

        {showRequest ? (
          <>
            <label htmlFor="creative-composer-request" className="sr-only">{tComposer("requestLabel")}</label>
            <textarea
              id="creative-composer-request"
              ref={requestRef}
              aria-label={tComposer("requestLabel")}
              value={request}
              onChange={(event) => {
                setFidelityError(null);
                onRequestChange(event.target.value);
              }}
              onFocus={() => {
                onExpandedChange?.(true);
                onRequestFocusChange?.(true);
              }}
              onBlur={() => onRequestFocusChange?.(false)}
              rows={centered ? 4 : 2}
              className={cn(
                "w-full resize-none bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                centered
                  ? "mt-4 min-h-28 text-lg leading-relaxed"
                  : "mt-2 min-h-10 field-sizing-content max-h-28 text-sm leading-snug",
                focus,
              )}
              placeholder={centered ? t("talkPlaceholderEmpty") : t("talkPlaceholderWork")}
            />
          </>
        ) : null}

        {interview?.enabled ? (
          <div className={centered ? "mt-4" : "mt-2"}>
            <StudioEntryInterview
              chips={interview.chips}
              answers={interview.answers}
              onSelect={interview.onSelect}
              locale={interview.locale}
              writtenToken={interview.writtenToken}
            />
            {interview.showContinue ? (
              <button
                type="button"
                data-testid="entry-interview-continue"
                onClick={interview.onContinue}
                className={cn("mt-3 text-sm font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline", focus)}
              >
                {interview.continueLabel}
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          id={controlsId}
          className={styles.controls}
          data-expanded={expanded ? "true" : "false"}
          inert={!expanded}
          aria-hidden={!expanded}
        >
          <div className={styles.controlsInner}>{children}</div>
        </div>
        </div>

        <div className={cn(styles.footer, "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", centered ? "mt-5" : "mt-3")}>
          {showAttachments ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {sources.length > 0 ? (
                <ul aria-label={t("talkAttachments")} className="flex gap-2">
                  {sources.slice(0, MAX_ATTACHMENTS).map((source) => (
                    <li key={source.id} className="size-11 overflow-hidden rounded-2xl border border-white/15">
                      {source.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={source.previewUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center text-[10px] text-[var(--text-muted)]">
                          {source.name.slice(0, 3)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              <input
                ref={fileInputRef}
                className="sr-only"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  void onAddFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachCount >= MAX_ATTACHMENTS}
                aria-label={attachLabel}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/12 hover:text-[var(--text-primary)]",
                  "disabled:opacity-50",
                  focus,
                )}
              >
                <Paperclip size={16} aria-hidden="true" />
                <span>{attachLabel}</span>
                {attachRequired ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--danger-text)]">
                    {t("talkRequired")}
                  </span>
                ) : null}
              </button>
            </div>
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {showGenerate && !hideGenerateWhileInterviewOwnsEntry ? (
            <button
              ref={primaryActionRef}
              type="button"
              onClick={generate}
              disabled={queued}
              className={cn(
                "talk-generate inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold",
                "disabled:opacity-50",
                focus,
              )}
            >
              <Sparkles size={15} aria-hidden="true" />
              {queued ? t("talkQueued") : generateLabel}
            </button>
            ) : null}
            {visibleError ? (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <p className="text-sm text-[var(--danger-text)]">{visibleError}</p>
                {retryInitialTemplate ? (
                  <button
                    type="button"
                    onClick={retryInitialTemplate}
                    className={cn("text-sm font-semibold text-[var(--danger-text)] underline-offset-2 hover:underline", focus)}
                  >
                    {tComposer("retryTemplate")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      </div>
    </ShineBorder>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

/** Limite por take (#351): 2 min, aviso aos 90 s. */
const MAX_TAKE_SECONDS = 120;
const WARNING_AT_SECONDS = 90;

type Status = "idle" | "listening" | "transcribing";
type ErrorCause = "permission" | "noMicrophone" | "network" | "unsupported" | "dailyLimit";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function DictationButton({
  workId,
  disabled = false,
  onInsert,
}: {
  workId?: string;
  disabled?: boolean;
  /** Texto limpo (ou bruto, se a limpeza falhar) pronto para entrar no cursor. */
  onInsert: (text: string) => void;
}) {
  const t = useTranslations("dashboard.home.composer.dictation");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<ErrorCause | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const transcribe = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      setStatus("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob, "dictation");
        form.append("durationSeconds", String(Math.max(1, Math.round(durationSeconds))));
        if (workId) {
          form.append("workId", workId);
        }
        const response = await apiFetch("/api/creative-work/dictation", {
          method: "POST",
          body: form,
          // Transcrição de até 2 min de áudio + limpeza: folga além dos 15 s default.
          timeoutMs: 120_000,
        });
        if (response.status === 429) {
          setError("dailyLimit");
          setStatus("idle");
          return;
        }
        if (!response.ok) {
          setError("network");
          setStatus("idle");
          return;
        }
        const body = (await response.json()) as { text?: string };
        if (typeof body.text !== "string" || body.text.trim().length === 0) {
          setError("network");
          setStatus("idle");
          return;
        }
        setError(null);
        setStatus("idle");
        onInsert(body.text);
      } catch {
        setError("network");
        setStatus("idle");
      }
    },
    [onInsert, workId]
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      setStatus("idle");
      return;
    }
    const durationSeconds = (Date.now() - startedAtRef.current) / 1000;
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      cleanup();
      void transcribe(blob, durationSeconds);
    };
    recorder.stop();
  }, [cleanup, transcribe]);

  const start = useCallback(async () => {
    if (!isSupported()) {
      setError("unsupported");
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        cleanup();
        setStatus("idle");
        setError("noMicrophone");
      };
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setStatus("listening");
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startedAtRef.current) / 1000);
      }, 500);
      stopTimeoutRef.current = setTimeout(() => stop(), MAX_TAKE_SECONDS * 1000);
    } catch (err) {
      cleanup();
      setStatus("idle");
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("permission");
      } else {
        setError("noMicrophone");
      }
    }
  }, [cleanup, stop]);

  const showWarning = status === "listening" && elapsed >= WARNING_AT_SECONDS;
  const errorKey: Record<ErrorCause, string> = {
    permission: t("permissionDenied"),
    noMicrophone: t("noMicrophone"),
    network: t("networkError"),
    unsupported: t("unsupported"),
    dailyLimit: t("dailyLimit"),
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="dictation-button"
        disabled={disabled || status === "transcribing"}
        onClick={() => (status === "listening" ? stop() : void start())}
        aria-label={status === "listening" ? t("stop") : t("start")}
        title={status === "listening" ? t("stop") : t("start")}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
          "border-[var(--border-default)] text-[var(--text-muted)]",
          "hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50",
          status === "listening" && "border-[var(--danger-border)] text-[var(--danger-text)]"
        )}
      >
        {status === "transcribing" ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : status === "listening" ? (
          <Square size={14} aria-hidden />
        ) : (
          <Mic size={14} aria-hidden />
        )}
        {status === "listening"
          ? t("listening", { time: formatElapsed(elapsed) })
          : status === "transcribing"
            ? t("transcribing")
            : t("start")}
      </button>
      {showWarning ? (
        <p role="status" className="text-xs text-[var(--text-muted)]">
          {t("timeWarning", { seconds: Math.max(0, Math.ceil(MAX_TAKE_SECONDS - elapsed)) })}
        </p>
      ) : null}
      {error && status === "idle" ? (
        <p role="alert" data-testid="dictation-error" className="text-xs text-[var(--danger-text)]">
          {errorKey[error]}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

export type VoiceInputButtonProps = {
  onTranscript: (text: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
};

export function appendTranscript(current: string, transcript: string, maxLength: number) {
  return [current.trimEnd(), transcript.trim()].filter(Boolean).join(" ").slice(0, maxLength);
}

function extensionFor(type: string) {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

export default function VoiceInputButton({ onTranscript, onBusyChange, disabled = false }: VoiceInputButtonProps) {
  const t = useTranslations("feedback.voice");
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<"idle" | "requesting" | "recording" | "transcribing" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [transcriptAdded, setTranscriptAdded] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);
  const requestingRef = useRef(false);
  const busy = state === "requesting" || state === "recording" || state === "transcribing";

  useEffect(() => {
    queueMicrotask(() => setSupported(Boolean(globalThis.MediaRecorder && navigator.mediaDevices?.getUserMedia)));
  }, []);
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => {
    if (state !== "recording") return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1_000);
    const timeout = window.setTimeout(() => recorderRef.current?.stop(), 60_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [state]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current) recorderRef.current.onstop = null;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function transcribe(blob: Blob) {
    setState("transcribing");
    try {
      const type = blob.type || "audio/webm";
      const form = new FormData();
      form.set("file", new File([blob], `feedback.${extensionFor(type)}`, { type }));
      const response = await apiFetch("/api/feedback/transcribe", { method: "POST", body: form, timeoutMs: 60_000 });
      if (!response.ok) throw new Error("transcription_failed");
      const body = await response.json() as { text: string };
      if (!mountedRef.current) return;
      onTranscript(body.text);
      setErrorKey(null);
      setTranscriptAdded(true);
      setState("idle");
    } catch {
      if (!mountedRef.current) return;
      setErrorKey("transcriptionError");
      setState("error");
    }
  }

  async function start() {
    if (requestingRef.current) return;
    requestingRef.current = true;
    setState("requesting");
    try {
      setSeconds(0);
      setErrorKey(null);
      setTranscriptAdded(false);
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const preferred = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined;
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (mountedRef.current) void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      setState("recording");
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      if (mountedRef.current) {
        setErrorKey("permissionError");
        setState("error");
      }
    } finally {
      requestingRef.current = false;
    }
  }

  if (!supported) return null;
  return <div className="flex items-center gap-2">
    <Button type="button" variant="outline" size="sm" aria-pressed={state === "recording"}
      aria-label={t(state === "recording" ? "stop" : state === "requesting" ? "requesting" : "start")}
      disabled={(disabled && state !== "recording") || state === "requesting" || state === "transcribing"}
      onClick={() => state === "recording" ? recorderRef.current?.stop() : void start()}>
      {state === "recording" ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
      {state === "recording" ? t("recording", { seconds }) : state === "requesting" ? t("requesting") : t("start")}
    </Button>
    <span aria-live="polite" className={state === "recording" || state === "requesting" ? "sr-only" : "text-xs text-[var(--text-muted)]"}>{state === "recording" ? t("recording", { seconds }) : state === "requesting" ? t("requesting") : state === "transcribing" ? t("transcribing") : transcriptAdded ? t("transcriptAdded") : null}</span>
    {errorKey ? <span role="alert" className="text-xs text-[var(--danger-text)]">{t(errorKey)}</span> : null}
  </div>;
}

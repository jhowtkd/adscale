"use client";

import { useEffect } from "react";
import { isChunkLoadError, isChunkScriptLoadError } from "@/lib/chunk-load-error";

const RELOAD_GUARD_KEY = "adscale_chunk_reload_guard";
const RELOAD_COOLDOWN_MS = 30_000;

function shouldAttemptReload(): boolean {
  const raw = sessionStorage.getItem(RELOAD_GUARD_KEY);
  if (!raw) return true;

  const lastAttempt = Number(raw);
  if (!Number.isFinite(lastAttempt)) return true;

  return Date.now() - lastAttempt > RELOAD_COOLDOWN_MS;
}

function markReloadAttempt() {
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
}

function recoverFromChunkLoadFailure() {
  if (!shouldAttemptReload()) return;
  markReloadAttempt();
  window.location.reload();
}

export default function ChunkLoadRecovery() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (!isChunkLoadError(event.reason)) return;
      event.preventDefault();
      recoverFromChunkLoadFailure();
    }

    function onWindowError(event: ErrorEvent) {
      if (!isChunkScriptLoadError(event)) return;
      event.preventDefault();
      recoverFromChunkLoadFailure();
    }

    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onWindowError, true);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onWindowError, true);
    };
  }, []);

  return null;
}

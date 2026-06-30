const CHUNK_LOAD_ERROR_PATTERN =
  /Loading chunk [\d]+ failed|ChunkLoadError|Failed to fetch dynamically imported module/i;

export function isChunkLoadError(reason: unknown): boolean {
  if (!reason) return false;

  if (reason instanceof Error) {
    if (reason.name === "ChunkLoadError") return true;
    if (CHUNK_LOAD_ERROR_PATTERN.test(reason.message)) return true;
  }

  if (typeof reason === "string") {
    return CHUNK_LOAD_ERROR_PATTERN.test(reason);
  }

  if (typeof reason === "object") {
    const candidate = reason as { name?: string; message?: string };
    if (candidate.name === "ChunkLoadError") return true;
    if (candidate.message && CHUNK_LOAD_ERROR_PATTERN.test(candidate.message)) {
      return true;
    }
  }

  return false;
}

export function isChunkScriptLoadError(event: ErrorEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLScriptElement)) return false;
  const src = target.src;
  return Boolean(src && src.includes("/_next/static/chunks/"));
}

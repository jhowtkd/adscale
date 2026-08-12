import { logger } from "@/lib/logger";

export type ImageJobTarget = "web" | "worker";
export type ImageRouteConcurrency = 1 | 2;

const HEAVY_EVENT_BASES = [
  "creative-work.generate",
  "derivation.generate",
  "creative-work.source.analyze",
  "workspace.asset.analyze",
  "brand.training.analyze",
  "creative-work.layerize",
] as const;

export type HeavyImageEventBase = (typeof HEAVY_EVENT_BASES)[number];

export function getImageJobTarget(): ImageJobTarget {
  const raw = process.env.IMAGE_JOB_TARGET?.trim().toLowerCase();
  if (!raw || raw === "web") return "web";
  if (raw === "worker") return "worker";
  logger.warn({
    event: "image_runtime_config",
    field: "IMAGE_JOB_TARGET",
    value: raw,
    fallback: "web",
    message: "Invalid IMAGE_JOB_TARGET; falling back to web",
  });
  return "web";
}

export function getImageRouteConcurrency(): ImageRouteConcurrency {
  const raw = process.env.IMAGE_ROUTE_CONCURRENCY?.trim();
  if (!raw || raw === "1") return 1;
  if (raw === "2") return 2;
  logger.warn({
    event: "image_runtime_config",
    field: "IMAGE_ROUTE_CONCURRENCY",
    value: raw,
    fallback: 1,
    message: "Invalid IMAGE_ROUTE_CONCURRENCY; falling back to 1",
  });
  return 1;
}

/** Resolve the event name for a heavy image job based on IMAGE_JOB_TARGET. */
export function resolveHeavyEventName(base: string): string {
  const target = getImageJobTarget();
  if (target === "worker") {
    return base.endsWith(".v2") ? base : `${base}.v2`;
  }
  return base.endsWith(".v2") ? base.slice(0, -3) : base;
}

export function isHeavyImageEventBase(name: string): name is HeavyImageEventBase {
  return (HEAVY_EVENT_BASES as readonly string[]).includes(name);
}

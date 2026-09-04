import { z } from "zod";

export const LAYER_EDITOR_LEASE_MS = 90_000;
export const LAYER_EDITOR_HEARTBEAT_MS = 30_000;
export const LAYER_EDITOR_AUTOSAVE_MS = 750;
export const LAYER_EDITOR_UNDO_LIMIT = 50;
export const LAYER_EDITOR_SIGNED_URL_TTL_SECONDS = 300;

export const LAYER_REGENERATION_STATUSES = ["reserved", "processing", "submission_unknown", "ready", "failed"] as const;
export type LayerRegenerationStatus = (typeof LAYER_REGENERATION_STATUSES)[number];

const isoDate = z.string().datetime({ offset: true });
const canvasSchema = z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const sourceSchema = z.object({
  order: z.number().int().min(0).max(16), name: z.string().trim().min(1).max(128), visible: z.boolean(),
  description: z.string().trim().max(1000).nullable().optional(),
  x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().positive(), height: z.number().int().positive(), key: z.string().min(1),
}).strict();
const layerSchema = z.object({
  id: z.string().uuid(), source: sourceSchema, order: z.number().int().min(0).max(16), name: z.string().trim().min(1).max(128), visible: z.boolean(),
  description: z.string().trim().max(1000).nullable().optional(),
  x: z.number().int().min(0), y: z.number().int().min(0), width: z.number().int().positive(), height: z.number().int().positive(),
  currentKey: z.string().min(1), currentKind: z.enum(["source", "regenerated"]), restorableKey: z.string().min(1).nullable(),
}).strict();
const leaseSchema = z.object({ id: z.string().uuid(), userId: z.string().min(1), acquiredAt: isoDate, expiresAt: isoDate }).strict();
const regenerationSchema = z.object({
  id: z.string().uuid(), status: z.enum(LAYER_REGENERATION_STATUSES), layerId: z.string().uuid(), instruction: z.string().trim().min(1).max(2000),
  requestedByUserId: z.string().min(1), usageKey: z.string().min(1), candidateKey: z.string().min(1).nullable(), providerRequestId: z.string().min(1).max(256).nullable(),
  failureCode: z.string().min(1).max(128).nullable(), createdAt: isoDate, updatedAt: isoDate,
}).strict();

export const layerEditorStateSchema = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().positive(), sourceLayerizationAttemptId: z.string().min(1).max(128), canvas: canvasSchema,
  layers: z.array(layerSchema).min(2).max(17), lease: leaseSchema.nullable(), regeneration: regenerationSchema.nullable(), publishedPsdKey: z.string().min(1).nullable(), updatedAt: isoDate,
}).strict().superRefine((state, context) => {
  const orders = new Set<number>();
  for (const [index, layer] of state.layers.entries()) {
    if (orders.has(layer.order)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers", index, "order"], message: "Layer orders must be unique" });
    orders.add(layer.order);
    if (layer.x + layer.width > state.canvas.width || layer.y + layer.height > state.canvas.height) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers", index], message: "Layer bounds must stay within the canvas" });
    }
  }
  for (let order = 0; order < state.layers.length; order += 1) {
    if (!orders.has(order)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["layers"], message: "Layer orders must be contiguous" });
  }
});

export type LayerEditorStateV1 = z.infer<typeof layerEditorStateSchema>;

export type LayerEditorQuotaBucket = { limit: number; used: number; remaining: number };
export type LayerEditorAccessV1 = {
  enabled: boolean;
  period: null | { startsAt: string; endsAt: string };
  layerize: LayerEditorQuotaBucket | null;
  regeneration: LayerEditorQuotaBucket | null;
};

export type PublicLayerEditorDocumentV1 = {
  schemaVersion: 1; revision: number; canvas: { width: number; height: number };
  layers: Array<{
    id: string;
    source: Omit<LayerEditorStateV1["layers"][number]["source"], "key"> & { imageUrl: string };
    order: number; name: string; visible: boolean; x: number; y: number; width: number; height: number;
    currentKind: "source" | "regenerated"; imageUrl: string; description: string | null;
  }>;
  lease: { mode: "edit" | "read"; leaseId: string | null; heldByName: string | null; expiresAt: string | null };
  regeneration: null | { id: string; status: LayerRegenerationStatus; layerId: string; instruction: string; candidateUrl: string | null; failureCode: string | null };
  updatedAt: string;
};

export type PublicLayerEditorSummaryV1 = { revision: number; layerCount: number; regenerationStatus: LayerRegenerationStatus | null; updatedAt: string };

export const layerEditorMutableSnapshotSchema = z.object({
  layers: z.array(z.object({
    id: z.string().uuid(), order: z.number().int(), name: z.string().trim().min(1).max(128), visible: z.boolean(),
    description: z.string().trim().max(1000).nullable().optional(),
    x: z.number().int(), y: z.number().int(), width: z.number().int().positive(), height: z.number().int().positive(), useSource: z.boolean(),
  }).strict()).min(2).max(17),
}).strict();
export type LayerEditorMutableSnapshotV1 = z.infer<typeof layerEditorMutableSnapshotSchema>;

export function layerEditorStateFromDatabase(value: unknown): LayerEditorStateV1 | null {
  const parsed = layerEditorStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function toPublicLayerEditorSummary(value: unknown): PublicLayerEditorSummaryV1 | null {
  const state = layerEditorStateFromDatabase(value);
  return state ? { revision: state.revision, layerCount: state.layers.length, regenerationStatus: state.regeneration?.status ?? null, updatedAt: state.updatedAt } : null;
}

import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";

export type LayerEditorCommand =
  | { type: "transform"; id: string; x: number; y: number; width: number; height: number }
  | { type: "rename"; id: string; name: string }
  | { type: "visibility"; id: string; visible: boolean }
  | { type: "reorder"; id: string; order: number }
  | { type: "restore"; id: string }
  | { type: "restoreAll" };

export type LayerEditorSession = { document: PublicLayerEditorDocumentV1; selectedLayerId: string | null; undo: PublicLayerEditorDocumentV1[]; redo: PublicLayerEditorDocumentV1[] };
const limit = 50;

function clampBox(document: PublicLayerEditorDocumentV1, layer: PublicLayerEditorDocumentV1["layers"][number], patch: Pick<PublicLayerEditorDocumentV1["layers"][number], "x" | "y" | "width" | "height">) {
  const width = Math.min(document.canvas.width, Math.max(1, Math.round(patch.width)));
  const height = Math.min(document.canvas.height, Math.max(1, Math.round(patch.height)));
  return { ...layer, width, height, x: Math.min(document.canvas.width - width, Math.max(0, Math.round(patch.x))), y: Math.min(document.canvas.height - height, Math.max(0, Math.round(patch.y))) };
}

function changed(session: LayerEditorSession, document: PublicLayerEditorDocumentV1): LayerEditorSession {
  return { ...session, document, undo: [...session.undo, session.document].slice(-limit), redo: [] };
}

export function createLayerEditorSession(document: PublicLayerEditorDocumentV1): LayerEditorSession { return { document, selectedLayerId: document.layers[0]?.id ?? null, undo: [], redo: [] }; }
export function selectLayer(session: LayerEditorSession, selectedLayerId: string | null): LayerEditorSession { return { ...session, selectedLayerId }; }
export function applyLayerEditorCommand(session: LayerEditorSession, command: LayerEditorCommand): LayerEditorSession {
  const layer = "id" in command ? session.document.layers.find((candidate) => candidate.id === command.id) : undefined;
  if ("id" in command && !layer) return session;
  if (command.type === "transform") return changed(session, { ...session.document, layers: session.document.layers.map((candidate) => candidate.id === command.id ? clampBox(session.document, candidate, command) : candidate) });
  if (command.type === "rename") return changed(session, { ...session.document, layers: session.document.layers.map((candidate) => candidate.id === command.id ? { ...candidate, name: command.name.trim().slice(0, 128) || candidate.name } : candidate) });
  if (command.type === "visibility") return changed(session, { ...session.document, layers: session.document.layers.map((candidate) => candidate.id === command.id ? { ...candidate, visible: command.visible } : candidate) });
  if (command.type === "reorder") {
    const ordered = [...session.document.layers].sort((a, b) => a.order - b.order);
    const from = ordered.findIndex((candidate) => candidate.id === command.id);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(Math.max(0, Math.min(ordered.length, command.order)), 0, moved);
    return changed(session, { ...session.document, layers: ordered.map((candidate, order) => ({ ...candidate, order })) });
  }
  if (command.type === "restore") return changed(session, { ...session.document, layers: session.document.layers.map((candidate) => candidate.id === command.id ? { ...candidate, name: candidate.source.name, visible: candidate.source.visible, x: candidate.source.x, y: candidate.source.y, width: candidate.source.width, height: candidate.source.height, order: candidate.source.order, currentKind: "source", imageUrl: candidate.source.imageUrl } : candidate) });
  return changed(session, { ...session.document, layers: session.document.layers.map((candidate) => ({ ...candidate, name: candidate.source.name, visible: candidate.source.visible, x: candidate.source.x, y: candidate.source.y, width: candidate.source.width, height: candidate.source.height, order: candidate.source.order, currentKind: "source", imageUrl: candidate.source.imageUrl })) });
}
export function undoLayerEditor(session: LayerEditorSession): LayerEditorSession { const document = session.undo.at(-1); return document ? { ...session, document, undo: session.undo.slice(0, -1), redo: [session.document, ...session.redo].slice(0, limit) } : session; }
export function redoLayerEditor(session: LayerEditorSession): LayerEditorSession { const document = session.redo[0]; return document ? { ...session, document, undo: [...session.undo, session.document].slice(-limit), redo: session.redo.slice(1) } : session; }

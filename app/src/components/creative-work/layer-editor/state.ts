import type { PublicLayerEditorDocumentV1 } from "@/server/layer-editor/contracts";

export type LayerEditorCommand =
  | { type: "transform"; id: string; x: number; y: number; width: number; height: number }
  | { type: "rename"; id: string; name: string }
  | { type: "visibility"; id: string; visible: boolean }
  | { type: "reorder"; id: string; order: number }
  | { type: "restore"; id: string }
  | { type: "restoreAll" };

export type LayerEditorSessionState = {
  past: PublicLayerEditorDocumentV1[];
  present: PublicLayerEditorDocumentV1;
  future: PublicLayerEditorDocumentV1[];
  selectedLayerId: string | null;
};

export type LayerEditorSession = LayerEditorSessionState;

const limit = 50;

function clampBox(document: PublicLayerEditorDocumentV1, layer: PublicLayerEditorDocumentV1["layers"][number], patch: Pick<PublicLayerEditorDocumentV1["layers"][number], "x" | "y" | "width" | "height">) {
  const width = Math.min(document.canvas.width, Math.max(1, Math.round(patch.width)));
  const height = Math.min(document.canvas.height, Math.max(1, Math.round(patch.height)));
  return { ...layer, width, height, x: Math.min(document.canvas.width - width, Math.max(0, Math.round(patch.x))), y: Math.min(document.canvas.height - height, Math.max(0, Math.round(patch.y))) };
}

function changed(session: LayerEditorSessionState, present: PublicLayerEditorDocumentV1): LayerEditorSessionState {
  return { ...session, present, past: [...session.past, session.present].slice(-limit), future: [] };
}

export function createLayerEditorSession(present: PublicLayerEditorDocumentV1): LayerEditorSessionState {
  return { present, selectedLayerId: present.layers[0]?.id ?? null, past: [], future: [] };
}

export function selectLayer(session: LayerEditorSessionState, selectedLayerId: string | null): LayerEditorSessionState {
  return { ...session, selectedLayerId };
}

export function applyLayerEditorCommand(session: LayerEditorSessionState, command: LayerEditorCommand): LayerEditorSessionState {
  const layer = "id" in command ? session.present.layers.find((candidate) => candidate.id === command.id) : undefined;
  if ("id" in command && !layer) return session;
  if (command.type === "transform") return changed(session, { ...session.present, layers: session.present.layers.map((candidate) => candidate.id === command.id ? clampBox(session.present, candidate, command) : candidate) });
  if (command.type === "rename") return changed(session, { ...session.present, layers: session.present.layers.map((candidate) => candidate.id === command.id ? { ...candidate, name: command.name.trim().slice(0, 128) || candidate.name } : candidate) });
  if (command.type === "visibility") return changed(session, { ...session.present, layers: session.present.layers.map((candidate) => candidate.id === command.id ? { ...candidate, visible: command.visible } : candidate) });
  if (command.type === "reorder") {
    const ordered = [...session.present.layers].sort((left, right) => left.order - right.order);
    const from = ordered.findIndex((candidate) => candidate.id === command.id);
    const [moved] = ordered.splice(from, 1);
    ordered.splice(Math.max(0, Math.min(ordered.length, command.order)), 0, moved);
    return changed(session, { ...session.present, layers: ordered.map((candidate, order) => ({ ...candidate, order })) });
  }
  if (command.type === "restore") return changed(session, { ...session.present, layers: session.present.layers.map((candidate) => candidate.id === command.id ? { ...candidate, name: candidate.source.name, visible: candidate.source.visible, x: candidate.source.x, y: candidate.source.y, width: candidate.source.width, height: candidate.source.height, order: candidate.source.order, currentKind: "source", imageUrl: candidate.source.imageUrl } : candidate) });
  return changed(session, { ...session.present, layers: session.present.layers.map((candidate) => ({ ...candidate, name: candidate.source.name, visible: candidate.source.visible, x: candidate.source.x, y: candidate.source.y, width: candidate.source.width, height: candidate.source.height, order: candidate.source.order, currentKind: "source", imageUrl: candidate.source.imageUrl })) });
}

export function undoLayerEditor(session: LayerEditorSessionState): LayerEditorSessionState {
  const present = session.past.at(-1);
  return present ? { ...session, present, past: session.past.slice(0, -1), future: [session.present, ...session.future].slice(0, limit) } : session;
}

export function redoLayerEditor(session: LayerEditorSessionState): LayerEditorSessionState {
  const present = session.future[0];
  return present ? { ...session, present, past: [...session.past, session.present].slice(-limit), future: session.future.slice(1) } : session;
}

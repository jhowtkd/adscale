import type { GuestDraft, Intent } from './guest-core.mjs';
export type GuestEvent = { name: string; detail: Record<string, string | boolean | number> };
export type GuestHomeOptions = {
  assetBase?: string;
  assetResolver?: (fileName: string) => string;
  preview?: boolean;
  attachmentsEnabled?: boolean;
  onContinue?: (draft: GuestDraft | null, resumePath: string) => void | Promise<void>;
  onEvent?: (event: GuestEvent) => void;
};
export function mountGuestHome(root: HTMLElement, options?: GuestHomeOptions): {
  ready: Promise<void>;
  getState: () => { request: string; intent: Intent; exampleId: string | null; files: File[]; draftId: string | null; previewResumePath: string | null };
  destroy: () => void;
};

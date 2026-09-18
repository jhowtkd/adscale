import type { GuestDraft } from './guest-core.mjs';
export function saveDraft(draft: GuestDraft): Promise<void>;
export function loadDraft(id: string | null): Promise<GuestDraft | null>;
export function loadLastDraft(): Promise<GuestDraft | null>;
export function removeDraft(id: string): Promise<void>;
export function pruneExpiredDrafts(): Promise<void>;

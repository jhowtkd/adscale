import type { ImportOutcome, TextImportInput } from '@/lib/guest-home/import-contracts';

// S4 stub: S5 wires the real canonical import. Until then every confirm
// attempt is honestly blocked and the draft stays saved.
export function useGuestDraftImport(): {
  importDraft: (input: TextImportInput) => Promise<ImportOutcome>;
} {
  return {
    importDraft: async () => ({ kind: 'blocked', code: 'import_not_available' }),
  };
}

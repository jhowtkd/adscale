export type GuestShellOptions = {
  attachmentsEnabled?: boolean;
};
export function renderShell(assetBase?: string, resolveAsset?: (fileName: string) => string, shellOptions?: GuestShellOptions): string;

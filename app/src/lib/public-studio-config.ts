export type LocalRewrite = { source: string; destination: string };

export type PublicStudioFlags = {
  homeEnabled: boolean;
  importEnabled: boolean;
  attachmentsEnabled: boolean;
};

export function readPublicStudioFlags(
  input: Record<string, string | undefined>,
): PublicStudioFlags {
  const flags = {
    homeEnabled: input.PUBLIC_STUDIO_HOME_ENABLED === 'true',
    importEnabled: input.PUBLIC_STUDIO_IMPORT_ENABLED === 'true',
    attachmentsEnabled: input.PUBLIC_STUDIO_ATTACHMENTS_ENABLED === 'true',
  };
  if ((flags.homeEnabled || flags.attachmentsEnabled) && !flags.importEnabled) {
    throw new Error('public_studio_import_required');
  }
  return flags;
}

export function publicStudioRewrites(): {
  beforeFiles: LocalRewrite[];
  afterFiles: LocalRewrite[];
  fallback: LocalRewrite[];
} {
  return {
    beforeFiles: [],
    afterFiles: [
      { source: '/manual', destination: '/manual/index.html' },
      { source: '/manual/', destination: '/manual/index.html' },
      { source: '/hi/assets/:path*', destination: '/adscale-guest/legacy-assets/:path*' },
      { source: '/hi/Adscale.svg', destination: '/adscale-guest/logo.svg' },
      { source: '/Adscale.svg', destination: '/adscale-guest/logo.svg' },
    ],
    fallback: [],
  };
}

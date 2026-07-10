export type ExecutionMode = 'auto' | 'local' | 'cloud';
export type ResolvedMode = 'local' | 'cloud';

export function resolveMode(
  requested: ExecutionMode,
  hasCredentials: boolean
): ResolvedMode {
  if (requested === 'local') return 'local';
  if (requested === 'cloud') {
    if (!hasCredentials) {
      throw new Error(
        'Cloud mode requires an API key or login. Run `deckhtml config set api-key <key>` or `deckhtml auth login`.'
      );
    }
    return 'cloud';
  }
  return hasCredentials ? 'cloud' : 'local';
}

export interface CloudOnlyFlags {
  embedFonts?: boolean;
}

export function validateCloudOnlyFlags(
  mode: ResolvedMode,
  flags: CloudOnlyFlags
): void {
  if (mode === 'local') {
    const used: string[] = [];
    if (flags.embedFonts) used.push('--embed-fonts');
    if (used.length > 0) {
      throw new Error(
        `${used.join(', ')} are cloud-only flags and cannot be used in local mode.`
      );
    }
  }
}

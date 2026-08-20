export type ExecutionMode = 'auto' | 'local' | 'cloud';
export type ResolvedMode = 'local' | 'cloud';

export function resolveMode(
  requested: ExecutionMode,
  hasCredentials: boolean
): ResolvedMode {
  if (requested === 'local') return 'local';
  // Cloud mode no longer requires credentials up front: the SDK always sends
  // X-Auth-UUID and the server treats UUID-only requests as rate-limited
  // guests. Invalid/expired token or API key are discarded and treated as
  // absent (guest). A subsequent 401 triggers the login / API-key guidance flow.
  if (requested === 'cloud') return 'cloud';
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

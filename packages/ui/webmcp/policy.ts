/**
 * Host seam for the WebMCP provider, following the `utils/upload.ts` shape:
 * a module-level default, `set`/`reset`/`get`, wired through
 * `configureHypermarkUI({ webmcp })`. Hypermark passes nothing and gets
 * today's behavior: enabled (whenever `document.modelContext` exists) with the
 * `hypermark.` name prefix.
 */

export interface WebMcpPolicy {
  /**
   * Master switch. Default `true`; the engine still registers nothing when
   * the browser has no `document.modelContext` or the user turned the tools
   * off in Settings.
   */
  enabled?: boolean;
  /** Prefix applied to every bare tool name. Default `"hypermark."`; hosts namespace their own tools. */
  namePrefix?: string;
}

export interface ResolvedWebMcpPolicy {
  enabled: boolean;
  namePrefix: string;
}

export const DEFAULT_WEBMCP_NAME_PREFIX = 'hypermark.';

const defaultPolicy: ResolvedWebMcpPolicy = {
  enabled: true,
  namePrefix: DEFAULT_WEBMCP_NAME_PREFIX,
};

let policy: ResolvedWebMcpPolicy = defaultPolicy;

/** Override the provider policy. Call once at app startup. */
export function setWebMcpPolicy(next: WebMcpPolicy): void {
  policy = {
    enabled: next.enabled ?? defaultPolicy.enabled,
    namePrefix: typeof next.namePrefix === 'string' ? next.namePrefix : defaultPolicy.namePrefix,
  };
}

/** Reset to Hypermark's default policy. Mainly for tests. */
export function resetWebMcpPolicy(): void {
  policy = defaultPolicy;
}

/** Read the active policy at call time (so a late override is honored). */
export function getWebMcpPolicy(): ResolvedWebMcpPolicy {
  return policy;
}

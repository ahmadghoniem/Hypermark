/**
 * Centralized agent configuration — single source of truth for all supported agents.
 *
 * This fork ships Claude Code only. The registry keeps its shape (rather than
 * collapsing to a constant) so `Origin` stays a real union and an archived
 * record carrying an unrecognized origin still degrades to "Coding Agent"
 * instead of throwing.
 */

type AgentConfigEntry = {
  name: string;
  badge: string;
};

export const AGENT_CONFIG = {
  'claude-code': { name: 'Claude Code', badge: 'bg-orange-500/15 text-orange-400' },
} as const satisfies Record<string, AgentConfigEntry>;

/** All recognized origin values. */
export type Origin = keyof typeof AGENT_CONFIG;

/** Resolve an origin to a human-readable agent name. */
export function getAgentName(origin: Origin | null | undefined): string {
  if (origin && origin in AGENT_CONFIG) return AGENT_CONFIG[origin as Origin].name;
  return 'Coding Agent';
}

/** Resolve an origin to Tailwind badge classes. */
export function getAgentBadge(origin: Origin | null | undefined): string {
  if (origin && origin in AGENT_CONFIG) return AGENT_CONFIG[origin as Origin].badge;
  return 'bg-zinc-500/20 text-zinc-400';
}

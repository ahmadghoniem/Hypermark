/**
 * Hypermark Shared Server
 *
 * Re-exports shared server utilities. The interactive servers live in
 * ./annotate.ts and ./review.ts.
 *
 * Environment variables:
 *   HYPERMARK_PORT   - Fixed port or inclusive range (default: random)
 *   HYPERMARK_ORIGIN - Explicit origin override; validated against AGENT_CONFIG
 *                        in packages/shared/agents.ts. This fork ships Claude
 *                        Code only, so the sole supported value is "claude-code".
 */

// Re-export utilities
export { openBrowser } from "./browser";
export * from "./storage";
export { handleServerReady } from "./shared-handlers";
export { createDefaultGetParentPid } from "./parent-watch";

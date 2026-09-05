import { useCallback, useEffect, useRef, useState } from 'react';
import { getItem, setItem } from '../utils/storage';
import { clampCodexReasoning } from '../utils/codexModels';

const COOKIE_KEY = 'plannotator.agents';

// Multiple live instances of this hook can be mounted at once (e.g. the
// Settings AgentsTab and the Guided Review empty-state launch panel are both
// mounted simultaneously). Each instance held fully independent state and
// wrote the WHOLE cookie blob on every change, so the last writer clobbered
// any change the other instance made in the meantime (e.g. picking a guide
// model in one tab silently reverted a review-engine pick made in the other).
// `settingsListeners` lets every write broadcast its resulting state to every
// OTHER mounted instance so they stay in sync without a shared store. Listeners
// must ONLY call setState — never re-write the cookie — or a broadcast loop
// would clobber writes exactly like before.
const settingsListeners = new Set<(s: AgentSettingsState) => void>();

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';
export const DEFAULT_CLAUDE_EFFORT = 'high';
// gpt-5.3-codex is deprecated (ChatGPT-account Codex rejects it outright) —
// default to the current flagship everywhere.
export const DEFAULT_CODEX_MODEL = 'gpt-5.5';
export const DEFAULT_CODEX_REASONING = 'high';
export const DEFAULT_CODEX_FAST = false;
// `auto` is Cursor's own default model id (from `agent models`); lowercase so it
// matches the discovered catalog and the buildCursorCommand omit-`--model` check.
export const DEFAULT_CURSOR_MODEL = 'auto';

// OpenCode has no `auto` pseudo-model; empty string means "use OpenCode's
// configured default" and buildOpencodeCommand omits `--model` for it.
export const DEFAULT_OPENCODE_MODEL = '';

// Pi has no `auto` pseudo-model either; empty string means "use Pi's own
// default" and buildArgv omits `--model` for it — same convention as OpenCode.
export const DEFAULT_PI_MODEL = '';
// Pi's unified reasoning knob (`--thinking`); 'medium' matches Pi's own default.
export const DEFAULT_PI_THINKING = 'medium';

// Copilot has no `auto` pseudo-model in our picker; empty string means "let
// Copilot pick" and copilotBuildArgv omits `--model` for it — same convention
// as OpenCode/Pi.
export const DEFAULT_COPILOT_MODEL = '';

interface ClaudeSection {
  model: string;
  perModel: Record<string, { effort: string }>;
}

interface CodexSection {
  model: string;
  perModel: Record<string, { reasoning: string; fast: boolean }>;
}

// Cursor/OpenCode have no per-model sub-settings (no effort/reasoning), so a
// flat { model } section is enough — deliberately simpler than Claude/Codex.
interface CursorSection {
  model: string; // 'auto' or a discovered model id
}

interface OpencodeSection {
  model: string; // '' (default) or a discovered provider/model id
}

// Pi: flat model plus its single global reasoning knob (`--thinking`), which
// applies to whatever model is selected — unlike Claude/Codex there is no
// per-model effort map.
interface PiSection {
  model: string; // '' (default) or a discovered model id
  thinking: string; // off | minimal | low | medium | high | xhigh
}

// Copilot: flat model only, like Cursor/OpenCode (its --effort knob is
// deliberately not surfaced yet — the CLI default is sensible).
interface CopilotSection {
  model: string; // '' (default) or a model id from `copilot help config`
}

export type AgentMode = 'review';
export type AgentEngine = 'claude' | 'codex';
export type ReviewEngine = AgentEngine | 'cursor' | 'opencode' | 'pi' | 'copilot';

interface AgentSettingsState {
  selectedMode?: AgentMode;
  reviewEngine: ReviewEngine;
  // Selected review profile is tracked per review engine so each agent can have
  // its own default (e.g. Claude runs one review, Cursor another) — mirrors how
  // `model` is per-engine. The current value is reviewProfileByEngine[reviewEngine].
  reviewProfileByEngine: Record<ReviewEngine, string>;
  claude: ClaudeSection;
  codex: CodexSection;
  cursor: CursorSection;
  opencode: OpencodeSection;
  pi: PiSection;
  copilot: CopilotSection;
}

const BUILTIN_DEFAULT_PROFILE = 'builtin:default';
const REVIEW_ENGINES: ReviewEngine[] = ['claude', 'codex', 'cursor', 'opencode', 'pi', 'copilot'];

const initialState: AgentSettingsState = {
  selectedMode: 'review',
  reviewEngine: 'claude',
  reviewProfileByEngine: {
    claude: BUILTIN_DEFAULT_PROFILE,
    codex: BUILTIN_DEFAULT_PROFILE,
    cursor: BUILTIN_DEFAULT_PROFILE,
    opencode: BUILTIN_DEFAULT_PROFILE,
    pi: BUILTIN_DEFAULT_PROFILE,
    copilot: BUILTIN_DEFAULT_PROFILE,
  },
  claude: { model: DEFAULT_CLAUDE_MODEL, perModel: {} },
  codex: { model: DEFAULT_CODEX_MODEL, perModel: {} },
  cursor: { model: DEFAULT_CURSOR_MODEL },
  opencode: { model: DEFAULT_OPENCODE_MODEL },
  pi: { model: DEFAULT_PI_MODEL, thinking: DEFAULT_PI_THINKING },
  copilot: { model: DEFAULT_COPILOT_MODEL },
};

// One-shot migration: drop any cached "none" codex reasoning entries. The
// dropdown no longer offers "None" (codex-rs rejects it as a config value);
// fall back to the default instead of shipping an invalid flag. Saved
// "minimal" entries migrate to "low": no current Codex model supports
// minimal, and low is the nearest effort that every model does.
export function sanitizeCodexPerModel(
  perModel: Record<string, { reasoning: string; fast: boolean }> | undefined,
): Record<string, { reasoning: string; fast: boolean }> {
  if (!perModel) return {};
  const out: Record<string, { reasoning: string; fast: boolean }> = {};
  for (const [model, entry] of Object.entries(perModel)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.reasoning === 'none') {
      if (entry.fast) out[model] = { reasoning: DEFAULT_CODEX_REASONING, fast: true };
      continue;
    }
    if (entry.reasoning === 'minimal') {
      out[model] = { ...entry, reasoning: 'low' };
      continue;
    }
    out[model] = entry;
  }
  return out;
}

// Saved model IDs that migrate to a direct replacement: the stale gpt-5.6
// slug (renamed to -sol when the tiered family shipped) and gpt-5.1-codex-mini
// (API shutdown 2026-07-23; gpt-5.4-mini is OpenAI's recommended replacement).
const RENAMED_CODEX_MODELS: Record<string, string> = {
  'gpt-5.6': 'gpt-5.6-sol',
  'gpt-5.1-codex-mini': 'gpt-5.4-mini',
};

// Saved model IDs with no direct replacement — migrate to the surface's
// fallback. gpt-5.3-codex is rejected outright by ChatGPT-account Codex;
// gpt-5.2-codex and gpt-5.1-codex-max hit the API-level shutdown on
// 2026-07-23 (OpenAI recommends gpt-5.5, which every fallback already is).
const RETIRED_CODEX_MODELS = new Set(['gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.1-codex-max']);

// One-shot model migrations for a saved Codex section. Keep its per-model
// preferences aligned with the canonical model ID while sanitizing them.
export function migrateCodexSection(
  section: { model?: unknown; perModel?: Record<string, { reasoning: string; fast: boolean }> } | undefined,
  fallback: string,
): CodexSection {
  const perModel = sanitizeCodexPerModel(section?.perModel);
  for (const [legacy, replacement] of Object.entries(RENAMED_CODEX_MODELS)) {
    const legacyPreference = perModel[legacy];
    if (legacyPreference) {
      perModel[replacement] ??= legacyPreference;
      delete perModel[legacy];
    }
  }

  const savedModel = section?.model;
  const model =
    typeof savedModel !== 'string' || RETIRED_CODEX_MODELS.has(savedModel)
      ? fallback
      : (RENAMED_CODEX_MODELS[savedModel] ?? savedModel);
  return { model, perModel };
}

function parseEngine(value: unknown): AgentEngine {
  return value === 'codex' ? 'codex' : 'claude';
}

function parseReviewEngine(value: unknown): ReviewEngine {
  if (value === 'cursor') return 'cursor';
  if (value === 'opencode') return 'opencode';
  if (value === 'pi') return 'pi';
  if (value === 'copilot') return 'copilot';
  return parseEngine(value);
}

function parseMode(value: unknown): AgentMode | undefined {
  if (value === 'review') return value;
  return undefined;
}

// Parse the per-engine review map, migrating the old flat global `reviewProfileId`:
// seed every engine with it so an existing pick isn't lost; engines diverge from there.
export function parseReviewProfileByEngine(parsed: {
  reviewProfileByEngine?: unknown;
  reviewProfileId?: unknown;
}): Record<ReviewEngine, string> {
  const byEngine = parsed.reviewProfileByEngine as Record<string, unknown> | undefined;
  const legacy = typeof parsed.reviewProfileId === 'string' ? parsed.reviewProfileId : BUILTIN_DEFAULT_PROFILE;
  const out = {} as Record<ReviewEngine, string>;
  for (const engine of REVIEW_ENGINES) {
    out[engine] = typeof byEngine?.[engine] === 'string' ? (byEngine[engine] as string) : legacy;
  }
  return out;
}

function readCookie(): AgentSettingsState {
  const raw = getItem(COOKIE_KEY);
  if (!raw) return initialState;
  try {
    const parsed = JSON.parse(raw);
    return {
      selectedMode: parseMode(parsed.selectedMode) ?? initialState.selectedMode,
      reviewEngine: parseReviewEngine(parsed.reviewEngine),
      reviewProfileByEngine: parseReviewProfileByEngine(parsed),
      claude: {
        model: typeof parsed.claude?.model === 'string' ? parsed.claude.model : DEFAULT_CLAUDE_MODEL,
        perModel: parsed.claude?.perModel ?? {},
      },
      codex: migrateCodexSection(parsed.codex, DEFAULT_CODEX_MODEL),
      cursor: {
        model: typeof parsed.cursor?.model === 'string' ? parsed.cursor.model : DEFAULT_CURSOR_MODEL,
      },
      opencode: {
        model: typeof parsed.opencode?.model === 'string' ? parsed.opencode.model : DEFAULT_OPENCODE_MODEL,
      },
      pi: {
        model: typeof parsed.pi?.model === 'string' ? parsed.pi.model : DEFAULT_PI_MODEL,
        thinking: typeof parsed.pi?.thinking === 'string' ? parsed.pi.thinking : DEFAULT_PI_THINKING,
      },
      copilot: {
        model: typeof parsed.copilot?.model === 'string' ? parsed.copilot.model : DEFAULT_COPILOT_MODEL,
      },
    };
  } catch {
    return initialState;
  }
}

export function useAgentSettings() {
  const [state, setState] = useState<AgentSettingsState>(readCookie);
  // Serialized form of the state this instance knows is already persisted
  // and broadcast. The persist effect compares VALUES against this instead
  // of using a "was the last update remote?" boolean: a boolean conflates
  // "a commit happened" with "the LAST change was remote", so a local edit
  // landing in the same commit window as an incoming broadcast (fast input
  // between paint and effects, or a setter batched with the remote apply)
  // would consume the flag and silently skip its own cookie write and
  // rebroadcast. Value comparison is idempotent: a pure remote apply
  // serializes identically and skips; ANY local delta differs and persists.
  const lastSyncedJsonRef = useRef<string | null>(null);
  // This instance's own listener function, so the broadcast loop below can
  // skip notifying itself.
  const ownListenerRef = useRef<((s: AgentSettingsState) => void) | null>(null);

  // Register to receive broadcasts from other mounted instances (e.g. the
  // Settings AgentsTab and the Guided Review empty-state launch panel are
  // both mounted at once, each with independent state — without this, the
  // last writer's cookie write would clobber the other's in-flight change).
  useEffect(() => {
    const listener = (next: AgentSettingsState) => {
      lastSyncedJsonRef.current = JSON.stringify(next);
      setState(next);
    };
    ownListenerRef.current = listener;
    settingsListeners.add(listener);
    return () => {
      settingsListeners.delete(listener);
      ownListenerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const json = JSON.stringify(state);
    if (json === lastSyncedJsonRef.current) return;
    lastSyncedJsonRef.current = json;
    setItem(COOKIE_KEY, json);
    for (const listener of settingsListeners) {
      if (listener !== ownListenerRef.current) listener(state);
    }
  }, [state]);

  const setSelectedMode = useCallback((mode: AgentMode) => {
    setState((s) => ({ ...s, selectedMode: mode }));
  }, []);

  const setReviewEngine = useCallback((engine: ReviewEngine) => {
    setState((s) => ({ ...s, reviewEngine: engine }));
  }, []);

  // Writes the review for the CURRENTLY selected engine, so each engine keeps its own.
  const setReviewProfileId = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      reviewProfileByEngine: { ...s.reviewProfileByEngine, [s.reviewEngine]: id },
    }));
  }, []);

  const setClaudeModel = useCallback((model: string) => {
    setState((s) => ({ ...s, claude: { ...s.claude, model } }));
  }, []);

  const patchClaude = useCallback(
    (patch: Partial<{ effort: string }>) => {
      setState((s) => {
        const cur = s.claude;
        const prev = cur.perModel[cur.model] ?? { effort: '' };
        return {
          ...s,
          claude: {
            ...cur,
            perModel: { ...cur.perModel, [cur.model]: { ...prev, ...patch } },
          },
        };
      });
    },
    [],
  );

  const setClaudeEffort = useCallback(
    (effort: string) => patchClaude({ effort }),
    [patchClaude],
  );

  const setCodexModel = useCallback((model: string) => {
    setState((s) => ({ ...s, codex: { ...s.codex, model } }));
  }, []);

  const setCursorModel = useCallback((model: string) => {
    setState((s) => ({ ...s, cursor: { ...s.cursor, model } }));
  }, []);

  const setOpencodeModel = useCallback((model: string) => {
    setState((s) => ({ ...s, opencode: { ...s.opencode, model } }));
  }, []);

  const setPiModel = useCallback((model: string) => {
    setState((s) => ({ ...s, pi: { ...s.pi, model } }));
  }, []);

  const setPiThinking = useCallback((thinking: string) => {
    setState((s) => ({ ...s, pi: { ...s.pi, thinking } }));
  }, []);

  const setCopilotModel = useCallback((model: string) => {
    setState((s) => ({ ...s, copilot: { ...s.copilot, model } }));
  }, []);

  const patchCodex = useCallback(
    (
      patch: Partial<{ reasoning: string; fast: boolean }>,
      defaults: { reasoning: string; fast: boolean },
    ) => {
      setState((s) => {
        const cur = s.codex;
        const prev = cur.perModel[cur.model] ?? defaults;
        return {
          ...s,
          codex: {
            ...cur,
            perModel: { ...cur.perModel, [cur.model]: { ...prev, ...patch } },
          },
        };
      });
    },
    [],
  );

  const setCodexReasoning = useCallback(
    (reasoning: string) => patchCodex({ reasoning }, { reasoning: DEFAULT_CODEX_REASONING, fast: DEFAULT_CODEX_FAST }),
    [patchCodex],
  );
  const setCodexFast = useCallback(
    (fast: boolean) => patchCodex({ fast }, { reasoning: DEFAULT_CODEX_REASONING, fast: DEFAULT_CODEX_FAST }),
    [patchCodex],
  );

  const claudeEffort = state.claude.perModel[state.claude.model]?.effort ?? DEFAULT_CLAUDE_EFFORT;
  // Codex reasoning is clamped through the model's supported-effort set: a
  // saved (or surface-default) effort the selected model doesn't support
  // snaps to that model's catalog default. Every consumer — the pickers AND
  // the launch payloads — reads these derived values, so an unsupported
  // effort can never reach `-c model_reasoning_effort=`.
  const codexReasoning = clampCodexReasoning(
    state.codex.model,
    state.codex.perModel[state.codex.model]?.reasoning ?? DEFAULT_CODEX_REASONING,
  );
  const codexFast = state.codex.perModel[state.codex.model]?.fast ?? DEFAULT_CODEX_FAST;

  return {
    selectedMode: state.selectedMode,
    reviewEngine: state.reviewEngine,
    reviewProfileId: state.reviewProfileByEngine[state.reviewEngine] ?? BUILTIN_DEFAULT_PROFILE,
    claudeModel: state.claude.model,
    claudeEffort,
    codexModel: state.codex.model,
    codexReasoning,
    codexFast,
    cursorModel: state.cursor.model,
    opencodeModel: state.opencode.model,
    piModel: state.pi.model,
    piThinking: state.pi.thinking,
    copilotModel: state.copilot.model,
    setSelectedMode,
    setReviewEngine,
    setReviewProfileId,
    setClaudeModel,
    setClaudeEffort,
    setCodexModel,
    setCodexReasoning,
    setCodexFast,
    setCursorModel,
    setOpencodeModel,
    setPiModel,
    setPiThinking,
    setCopilotModel,
  };
}

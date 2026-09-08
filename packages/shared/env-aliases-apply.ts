/**
 * Side-effect entry point for the legacy environment aliases.
 *
 * Importing this module applies `PLANNOTATOR_*` -> `HYPERMARK_*` to
 * `process.env` once, at import time. It is deliberately separate from
 * `env-aliases.ts`: that module is pure and testable, this one is the single
 * place allowed to mutate the real environment, so a test importing the rule
 * never changes the process it runs in.
 *
 * Import it FIRST from a process entry point, before anything that reads
 * configuration. ES module imports are hoisted and evaluated in order, so an
 * `import "@hypermark/shared/env-aliases-apply";` placed above the other
 * imports runs before them.
 */

import { applyLegacyEnvAliases } from "./env-aliases";

applyLegacyEnvAliases(process.env);

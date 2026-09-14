// Tailwind class linting only. No general JS/TS rules are configured here.
//
// Run one package at a time (see the `lint:tw` scripts): enforce-canonical-classes
// under-reports when a single run spans several top-level directories.
import betterTailwind from "eslint-plugin-better-tailwindcss";
import { defineConfig } from "eslint/config";
import { parser as tsParser } from "typescript-eslint";

const variant = "^(.*:)?";

const tailwindRules = {
  // Tailwind's own canonicalizer: size-4 over w-4 h-4, shrink-0 over flex-shrink-0,
  // data-foo: over data-[foo]:, scale steps over matching arbitrary px.
  // Arbitrary font sizes are skipped: the review bundle redefines --text-xs as
  // 13px, so rewriting text-[12px] to text-xs would change sizes there.
  "better-tailwindcss/enforce-canonical-classes": ["warn", {
    rootFontSize: 16, collapse: true, logical: true, ignore: ["^(.*:)?text-\\[[0-9.]+(px|rem)\\]"],
  }],
  // Two classes setting the same property. Never autofixed: emission order, not
  // markup order, decides which one wins.
  "better-tailwindcss/no-conflicting-classes": "warn",
  "better-tailwindcss/no-duplicate-classes": "warn",
  // no-concatenated-classes stays off: the codebase joins complete class names
  // in template literals (`flex${x ? ' gap-1' : ''}`), which it cannot tell
  // apart from a generated `bg-${color}-500`.
  "better-tailwindcss/no-restricted-classes": ["warn", {
    restrict: [
      {
        // Bare `rounded` is a fixed 0.25rem; the named steps follow the theme's --radius.
        pattern: `${variant}rounded(-(?:t|r|b|l|s|e|tl|tr|br|bl|ss|se|es|ee))?$`,
        fix: "$1rounded$2-sm",
        message: "Bare rounded ignores the theme radius. Use rounded$2-sm (or -md/-lg).",
      },
      {
        pattern: `${variant}(bg|text|border|ring|outline|fill|stroke|from|via|to|divide|decoration)-\\[#`,
        message: "Raw hex colour. Use a semantic theme token.",
      },
      {
        // bg-black/N scrims stay black in both modes, so they are allowed.
        pattern: `${variant}(bg-white|(text|border|ring|outline|fill|stroke|divide|decoration)-(white|black))(\\/.*)?$`,
        message: "Raw white/black cannot follow the theme. Use a semantic token (background, foreground, primary-foreground, ...).",
      },
      {
        pattern: `${variant}(bg|text|border|ring|outline|fill|stroke|divide|decoration)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d+(\\/.*)?$`,
        message: "Raw palette colour. Use a semantic token (primary, destructive, success, warning, muted-foreground, ...) unless it is purely decorative.",
      },
      {
        pattern: `${variant}(min-|max-)?h-screen$`,
        fix: "$1$2h-dvh",
        message: "h-screen ignores mobile browser chrome. Use h-dvh.",
      },
    ],
  }],
};

// Inline disable comments name react-hooks rules; register the names so ESLint
// does not report them as unknown. Nothing here runs those rules.
const reactHooksStub = {
  rules: Object.fromEntries(["exhaustive-deps", "rules-of-hooks"].map((name) => [name, { create: () => ({}) }])),
};

const tsx = {
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
};

export default defineConfig([
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build-stubs/**", "**/*.test.*", "**/test-consumer/**"],
  },
  {
    // The react-hooks disable comments look unused because those rules do not
    // run here; --fix must not delete them.
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
  {
    // packages/ui is compiled through the editor's stylesheet (and review-editor's,
    // which imports the same theme.css).
    files: ["packages/ui/**/*.{ts,tsx}", "packages/editor/**/*.{ts,tsx}", "apps/hook/**/*.tsx"],
    ...tsx,
    plugins: { "better-tailwindcss": betterTailwind, "react-hooks": reactHooksStub },
    settings: { "better-tailwindcss": { cwd: "packages/editor", entryPoint: "index.css" } },
    rules: tailwindRules,
  },
  {
    files: ["packages/review-editor/**/*.{ts,tsx}", "apps/review/**/*.tsx"],
    ...tsx,
    plugins: { "better-tailwindcss": betterTailwind, "react-hooks": reactHooksStub },
    settings: { "better-tailwindcss": { cwd: "packages/review-editor", entryPoint: "index.css" } },
    rules: tailwindRules,
  },
]);

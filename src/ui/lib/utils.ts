import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom theme names from theme.css. Unregistered, text-micro would be read as a
// text colour and cn("text-micro", "text-muted-foreground") would drop one.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title", "subtitle", "body", "caption", "micro", "doc"] }],
      z: [{ z: ["chrome", "resize", "panel-scrim", "panel", "menu", "popover", "popover-hint", "dialog", "overlay"] }],
      m: [{ m: ["doc", "doc-wide", "doc-rule"] }],
      my: [{ my: ["doc", "doc-wide", "doc-rule"] }],
      mb: [{ mb: ["doc", "doc-wide", "doc-rule"] }],
    },
  },
});

/**
 * Merge class names with Tailwind-aware conflict resolution.
 * `clsx` handles conditionals/arrays; `twMerge` dedupes conflicting utilities
 * (so a later `bg-*` wins over an earlier one, etc.).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

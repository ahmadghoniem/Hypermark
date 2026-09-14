import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom theme names from theme.css. Unregistered, text-2xs would be read as a
// text colour and cn("text-2xs", "text-muted-foreground") would drop one.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["2xs", "3xs", "4xs", "plan"] }],
      z: [{ z: ["chrome", "resize", "panel-scrim", "panel", "menu", "popover", "popover-hint", "dialog", "overlay"] }],
      m: [{ m: ["plan", "plan-wide", "plan-rule"] }],
      my: [{ my: ["plan", "plan-wide", "plan-rule"] }],
      mb: [{ mb: ["plan", "plan-wide", "plan-rule"] }],
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

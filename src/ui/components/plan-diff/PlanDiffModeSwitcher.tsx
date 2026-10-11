/**
 * PlanDiffModeSwitcher — Toggle between clean/rendered and raw diff views
 *
 * Follows the same visual pattern as ModeSwitcher.
 */

import React from "react";

import { Code01, Eye, Menu01 } from '@untitledui/icons';
export type PlanDiffMode = "clean" | "classic" | "raw";

interface PlanDiffModeSwitcherProps {
  mode: PlanDiffMode;
  onChange: (mode: PlanDiffMode) => void;
}

export const PlanDiffModeSwitcher: React.FC<PlanDiffModeSwitcherProps> = ({
  mode,
  onChange,
}) => {
  return (
    <div className="inline-flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/30">
      <button
        onClick={() => onChange("clean")}
        title="Word-level inline diff (experimental)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
          mode === "clean"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Eye className="size-3.5" />
        Rendered
        <span className="text-4xs uppercase tracking-wider opacity-60 ml-0.5">
          exp
        </span>
      </button>
      <button
        onClick={() => onChange("classic")}
        title="Block-level stacked diff (old above new)"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
          mode === "classic"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Menu01 className="size-3.5" />
        Classic
      </button>
      <button
        onClick={() => onChange("raw")}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
          mode === "raw"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Code01 className="size-3.5" />
        Raw
      </button>
    </div>
  );
};

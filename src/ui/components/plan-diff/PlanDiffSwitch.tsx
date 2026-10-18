/**
 * PlanDiffSwitch — the +/- counts and a "Show changes" switch at the plan
 * card's top right. Turning it on swaps the card's content for the diff in
 * the same place (see PlanDiffCard); turning it off swaps the plan back.
 */

import React from "react";
import type { PlanDiffStats } from "../../utils/planDiffEngine";
import { Switch } from "../../fluid/components/switch";
import { Tooltip } from "../../fluid/components/tooltip";

/** Whether the stats hold anything worth a switch. */
export function hasPlanDiffChanges(stats: PlanDiffStats | null | undefined): stats is PlanDiffStats {
  return !!stats && (stats.additions > 0 || stats.deletions > 0 || stats.modifications > 0);
}

interface PlanDiffSwitchProps {
  stats: PlanDiffStats;
  checked: boolean;
  onToggle: () => void;
  /** What the diff is against, e.g. "Changes since you last reviewed this file". */
  baselineTooltip?: string;
  /** The base version, e.g. "v2"; shown in the tooltip as "vs v2". */
  baseVersionLabel?: string;
}

export const PlanDiffSwitch: React.FC<PlanDiffSwitchProps> = ({
  stats,
  checked,
  onToggle,
  baselineTooltip,
  baseVersionLabel,
}) => {
  const tooltip = [
    baselineTooltip ?? "Show what changed from previous version",
    baseVersionLabel && `vs ${baseVersionLabel}`,
  ].filter(Boolean).join(" · ");

  return (
    <Tooltip content={tooltip} side="bottom">
      <div className="flex items-center gap-2">
        <span className="font-mono text-micro">
          <span className={checked ? "text-success" : "text-success/70"}>+{stats.additions}</span>
          <span className="mx-0.5 text-muted-foreground/50">/</span>
          <span className={checked ? "text-destructive" : "text-destructive/70"}>-{stats.deletions}</span>
        </span>
        <Switch label="Show changes" size="compact" checked={checked} onToggle={onToggle} />
      </div>
    </Tooltip>
  );
};

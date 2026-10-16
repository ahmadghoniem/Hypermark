/**
 * VersionBrowser — Version list for plan diff
 *
 * Shows all versions of the current plan and allows selecting
 * which version to diff against.
 */

import React, { useEffect } from "react";
import type { VersionInfo, VersionEntry } from "../../hooks/usePlanDiff";
import { Button } from "../../fluid/components/button";

interface VersionBrowserProps {
  versionInfo: VersionInfo | null;
  versions: VersionEntry[];
  selectedBaseVersion: number | null;
  onSelectBaseVersion: (version: number) => void;
  isPlanDiffActive: boolean;
  hasPreviousVersion: boolean;
  onActivatePlanDiff: () => void;
  isLoading: boolean;
  isSelectingVersion: boolean;
  fetchingVersion: number | null;
  onFetchVersions: () => void;
}

function relativeTime(timestamp: string): string {
  if (!timestamp) return "";
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export const VersionBrowser: React.FC<VersionBrowserProps> = ({
  versionInfo,
  versions,
  selectedBaseVersion,
  onSelectBaseVersion,
  isPlanDiffActive,
  hasPreviousVersion,
  onActivatePlanDiff,
  isLoading,
  isSelectingVersion,
  fetchingVersion,
  onFetchVersions,
}) => {
  // Fetch version list once versionInfo is available
  useEffect(() => {
    if (versionInfo && versions.length === 0) {
      onFetchVersions();
    }
  }, [versionInfo, versions.length, onFetchVersions]);

  if (!versionInfo) {
    return (
      <div className="p-4 text-caption text-muted-foreground text-center">
        No version history available.
      </div>
    );
  }

  const currentVersion = versionInfo.version;
  const totalVersions = versionInfo.totalVersions;

  return (
    <div className="p-3">
      {/* Current version info */}
      <div className="mb-3">
        <div className="text-micro font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Current Plan
        </div>
        <div className="text-caption text-foreground">
          Version {currentVersion} of {totalVersions}
        </div>
      </div>

      {/* Show Diff button if not active */}
      {hasPreviousVersion && !isPlanDiffActive && (
        <Button
          variant="secondary"
          size="compact"
          onClick={onActivatePlanDiff}
          className="w-full mb-3 font-semibold"
        >
          Show Changes
        </Button>
      )}

      {/* Version list */}
      {totalVersions > 1 && (
        <div className="mb-3">
          <div className="text-micro font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Compare Against
          </div>

          {isLoading ? (
            <div className="text-caption text-muted-foreground py-2 text-center">
              Loading...
            </div>
          ) : (
            <div className="space-y-0.5">
              {versions
                .filter((v) => v.version !== currentVersion)
                .reverse()
                .map((v) => {
                  const isSelected = selectedBaseVersion === v.version;
                  return (
                    <Button
                      key={v.version}
                      variant="ghost"
                      size="compact"
                      active={isSelected}
                      aria-pressed={isSelected}
                      onClick={() => onSelectBaseVersion(v.version)}
                      className="w-full justify-start text-left text-foreground"
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="font-semibold">
                          v{v.version}
                          {v.version === currentVersion - 1 && (
                            <span className="ml-1 text-muted-foreground font-normal">
                              (previous)
                            </span>
                          )}
                        </span>
                        <span className="text-micro text-muted-foreground">
                          {fetchingVersion === v.version ? "Loading..." : relativeTime(v.timestamp)}
                        </span>
                      </span>
                    </Button>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * SidebarContainer — the left sidebar.
 *
 * A "Versions" header over the version browser. The column starts at the top
 * of the viewport, under the app header, and is rendered only when the plan
 * has more than one version.
 *
 * It is a permanent column: no collapse, no drag-resize. Its width is the
 * `width` dial below, so the layout has exactly one place to change it.
 */

import React from "react";
import type { VersionInfo, VersionEntry } from "../../hooks/usePlanDiff";
import { VersionBrowser } from "./VersionBrowser";
import { OverlayScrollArea } from "../OverlayScrollArea";

import { Clock } from '@untitledui/icons';
interface SidebarContainerProps {
  versionInfo: VersionInfo | null;
  versions: VersionEntry[];
  selectedBaseVersion: number | null;
  onSelectBaseVersion: (version: number) => void;
  isPlanDiffActive: boolean;
  hasPreviousVersion: boolean;
  onActivatePlanDiff: () => void;
  isLoadingVersions: boolean;
  isSelectingVersion: boolean;
  fetchingVersion: number | null;
  onFetchVersions: () => void;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  versionInfo,
  versions,
  selectedBaseVersion,
  onSelectBaseVersion,
  isPlanDiffActive,
  hasPreviousVersion,
  onActivatePlanDiff,
  isLoadingVersions,
  isSelectingVersion,
  fetchingVersion,
  onFetchVersions,
}) => {
  return (
    <aside
      className="hidden min-[1480px]:flex flex-col sticky top-12 h-[calc(100vh-3rem)] shrink-0 bg-surface-2"
      style={{ width: 240 }}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3.5">
        <span className="flex shrink-0 text-muted-foreground" aria-hidden="true">
          <Clock className="size-3.5" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-caption font-semibold text-foreground">
          Versions
        </h2>
      </div>

      {/* Content area */}
      <OverlayScrollArea className="flex-1 min-h-0">
        <VersionBrowser
          versionInfo={versionInfo}
          versions={versions}
          selectedBaseVersion={selectedBaseVersion}
          onSelectBaseVersion={onSelectBaseVersion}
          isPlanDiffActive={isPlanDiffActive}
          hasPreviousVersion={hasPreviousVersion}
          onActivatePlanDiff={onActivatePlanDiff}
          isLoading={isLoadingVersions}
          isSelectingVersion={isSelectingVersion}
          fetchingVersion={fetchingVersion}
          onFetchVersions={onFetchVersions}
        />
      </OverlayScrollArea>
    </aside>
  );
};

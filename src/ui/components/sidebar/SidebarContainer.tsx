/**
 * SidebarContainer — the left sidebar.
 *
 * A header ("On this page", or "Versions") over the table of contents or the
 * version browser. The column starts at the top of the viewport, under the app
 * header.
 *
 * It is a permanent column: no collapse, no drag-resize. Its width is the
 * `width` dial below, so the layout has exactly one place to change it.
 */

import React from "react";
import type { SidebarTab } from "../../hooks/useSidebar";
import type { Block } from "../../types";
import type { VersionInfo, VersionEntry } from "../../hooks/usePlanDiff";
import { TableOfContents } from "../TableOfContents";
import { VersionBrowser } from "./VersionBrowser";
import { OverlayScrollArea } from "../OverlayScrollArea";
import { Button } from "../../fluid/components/button";
import { Tooltip } from "../../fluid/components/tooltip";

import { Clock, List } from '@untitledui/icons';
interface SidebarContainerProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  // TOC props
  showContentsTab?: boolean;
  blocks: Block[];
  activeSection: string | null;
  onTocNavigate: (blockId: string) => void;
  linkedDocFilepath?: string | null;
  onLinkedDocBack?: () => void;
  backLabel?: string;
  // Version Browser props
  showVersionsTab?: boolean;
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
  activeTab,
  onTabChange,
  showContentsTab = true,
  blocks,
  activeSection,
  onTocNavigate,
  linkedDocFilepath,
  onLinkedDocBack,
  backLabel,
  showVersionsTab,
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
  const showingVersions = activeTab === "versions" && !!showVersionsTab;

  return (
    <aside
      className="hidden lg:flex flex-col sticky top-12 h-[calc(100vh-3rem)] shrink-0 bg-card"
      style={{ width: 240 }}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3.5">
        <span className="flex shrink-0 text-muted-foreground" aria-hidden="true">
          {showingVersions ? <ClockIcon /> : <OutlineIcon />}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-caption font-semibold text-foreground">
          {showingVersions ? "Versions" : "On this page"}
        </h2>
        {showVersionsTab && (
          <Tooltip content={showingVersions ? "Back to contents" : "Plan versions"} side="bottom">
            <Button
              variant="ghost"
              size="icon-compact"
              onClick={() => onTabChange(showingVersions ? "toc" : "versions")}
              aria-label={showingVersions ? "Back to contents" : "Plan versions"}
              aria-pressed={showingVersions}
              className="shrink-0"
            >
              {showingVersions ? <OutlineIcon /> : <ClockIcon />}
            </Button>
          </Tooltip>
        )}
      </div>

      {/* Content area */}
      <OverlayScrollArea className="flex-1 min-h-0">
        {!showingVersions && showContentsTab && (
          <TableOfContents
            blocks={blocks}
            activeId={activeSection}
            onNavigate={onTocNavigate}
            className=""
            indent={12}
            radius={8}
            linkedDocFilepath={linkedDocFilepath}
            onLinkedDocBack={onLinkedDocBack}
            backLabel={backLabel}
          />
        )}
        {showingVersions && (
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
        )}
      </OverlayScrollArea>
    </aside>
  );
};

/** Four lines, the middle two inset: an outline. */
const OutlineIcon: React.FC = () => (
  <List className="size-3.5" />
);

const ClockIcon: React.FC = () => (
  <Clock className="size-3.5" />
);

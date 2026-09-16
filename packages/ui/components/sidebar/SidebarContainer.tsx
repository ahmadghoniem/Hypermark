/**
 * SidebarContainer — the left sidebar.
 *
 * A header ("On this page", or "Versions") over the table of contents or the
 * version browser. The host passes `contentTopOffset` so the header sits level
 * with the document's first heading.
 */

import React from "react";
import { useDialKit } from "dialkit";
import type { SidebarTab } from "../../hooks/useSidebar";
import type { Block, Annotation } from "../../types";
import type { VersionInfo, VersionEntry } from "../../hooks/usePlanDiff";
import { TableOfContents } from "../TableOfContents";
import { VersionBrowser } from "./VersionBrowser";
import { OverlayScrollArea } from "../OverlayScrollArea";

interface SidebarContainerProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  width: number | string;
  /** Top padding, in px, that puts the header level with the document title. */
  contentTopOffset?: number;
  // TOC props
  showContentsTab?: boolean;
  blocks: Block[];
  annotations: Annotation[];
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
  width,
  contentTopOffset = 0,
  showContentsTab = true,
  blocks,
  annotations,
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
  const dials = useDialKit('05 · Sidebar', {
    rowHeight: [28, 22, 36, 1],
    /** x of the hairline for levels 1–2, and for level 3. */
    lineOuter: [6, 2, 14, 1],
    lineInner: [18, 10, 30, 1],
    lineStroke: [1.25, 0.75, 2, 0.25],
  }, { id: 'cl-05', persist: true });
  const showingVersions = activeTab === "versions" && !!showVersionsTab;

  return (
    <aside
      className="hidden lg:flex flex-col sticky top-12 h-[calc(100vh-3rem)] shrink-0 bg-card"
      style={{ width, paddingTop: contentTopOffset }}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3.5">
        <span className="flex shrink-0 text-muted-foreground" aria-hidden="true">
          {showingVersions ? <ClockIcon /> : <OutlineIcon />}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {showingVersions ? "Versions" : "On this page"}
        </h2>
        {showVersionsTab && (
          <button
            type="button"
            onClick={() => onTabChange(showingVersions ? "toc" : "versions")}
            title={showingVersions ? "Back to contents" : "Plan versions"}
            aria-label={showingVersions ? "Back to contents" : "Plan versions"}
            aria-pressed={showingVersions}
            className="grid size-5.5 shrink-0 place-items-center rounded-md p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {showingVersions ? <OutlineIcon /> : <ClockIcon />}
          </button>
        )}
      </div>

      {/* Content area */}
      <OverlayScrollArea className="flex-1 min-h-0">
        {!showingVersions && showContentsTab && (
          <TableOfContents
            blocks={blocks}
            annotations={annotations}
            activeId={activeSection}
            onNavigate={onTocNavigate}
            className=""
            rowHeight={dials.rowHeight}
            lineOuter={dials.lineOuter}
            lineInner={dials.lineInner}
            lineStroke={dials.lineStroke}
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
  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
    <path d="M4 5h16" />
    <path d="M9 10h11" />
    <path d="M9 15h11" />
    <path d="M4 20h16" />
  </svg>
);

const ClockIcon: React.FC = () => (
  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

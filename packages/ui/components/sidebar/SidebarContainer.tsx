/**
 * SidebarContainer — Shared sidebar shell
 *
 * Houses the Table of Contents, Version Browser and Messages Browser views.
 * Tab bar at top switches between them.
 */

import React from "react";
import type { SidebarTab } from "../../hooks/useSidebar";
import type { Block, Annotation } from "../../types";
import type { VersionInfo, VersionEntry } from "../../hooks/usePlanDiff";
import { TableOfContents } from "../TableOfContents";
import { VersionBrowser } from "./VersionBrowser";
import { MessagesBrowser, type PickerMessage } from "./MessagesBrowser";
import { MessagesIcon } from "../icons/MessagesIcon";
import { OverlayScrollArea } from "../OverlayScrollArea";
import { ReviewAgentsIcon } from "../ReviewAgentsIcon";

interface SidebarContainerProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onClose: () => void;
  width: number | string;
  showAgentTerminalButton?: boolean;
  isAgentTerminalOpen?: boolean;
  isAgentTerminalRunning?: boolean;
  onToggleAgentTerminal?: () => void;
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
  showMessagesTab?: boolean;
  messages?: PickerMessage[];
  selectedMessageId?: string | null;
  onSelectMessage?: (messageId: string) => void;
  messageAnnotationCounts?: Map<string, number>;
}

export const SidebarContainer: React.FC<SidebarContainerProps> = ({
  activeTab,
  onTabChange,
  onClose,
  width,
  showAgentTerminalButton,
  isAgentTerminalOpen,
  isAgentTerminalRunning,
  onToggleAgentTerminal,
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
  showMessagesTab,
  messages,
  selectedMessageId,
  onSelectMessage,
  messageAnnotationCounts,
}) => {

  return (
    <aside
      className="hidden lg:flex flex-col sticky top-12 h-[calc(100vh-3rem)] flex-shrink-0 bg-card border-r border-border"
      style={{ width }}
    >
      {/* Tab bar */}
      <div className="flex h-10 items-center border-b border-border/50 px-2 gap-0.5 flex-shrink-0 overflow-hidden min-w-0">
        {showAgentTerminalButton && onToggleAgentTerminal && (
          <ActionButton
            active={!!isAgentTerminalOpen}
            running={!!isAgentTerminalRunning}
            onClick={onToggleAgentTerminal}
            icon={<ReviewAgentsIcon className="w-3 h-3" />}
            label="Agent"
          />
        )}
        {showContentsTab && (
          <TabButton
            active={activeTab === "toc"}
            onClick={() => onTabChange("toc")}
            icon={
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 10h16M4 14h10M4 18h10"
                />
              </svg>
            }
            label="Contents"
          />
        )}
        {showVersionsTab && (
          <TabButton
            active={activeTab === "versions"}
            onClick={() => onTabChange("versions")}
            icon={
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
            label="Versions"
          />
        )}
        {showMessagesTab && (
          <TabButton
            active={activeTab === "messages"}
            onClick={() => onTabChange("messages")}
            icon={<MessagesIcon className="w-3 h-3" />}
            label="Messages"
            badge={messageAnnotationCounts !== undefined && messageAnnotationCounts.size > 0}
          />
        )}
        {/* No header close button — the sidebar collapses via the resize-handle
            hover button (see ResizeHandle onCollapse). */}
      </div>

      {/* Content area */}
      <OverlayScrollArea className="flex-1 min-h-0">
        {activeTab === "toc" && showContentsTab && (
          <TableOfContents
            blocks={blocks}
            annotations={annotations}
            activeId={activeSection}
            onNavigate={onTocNavigate}
            className=""
            linkedDocFilepath={linkedDocFilepath}
            onLinkedDocBack={onLinkedDocBack}
            backLabel={backLabel}
          />
        )}
        {activeTab === "versions" && (
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
        {activeTab === "messages" && showMessagesTab && messages && onSelectMessage && (
          <MessagesBrowser
            messages={messages}
            selectedMessageId={selectedMessageId ?? null}
            onSelect={onSelectMessage}
            annotationCounts={messageAnnotationCounts}
          />
        )}
      </OverlayScrollArea>
    </aside>
  );
};

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: boolean;
}> = ({ active, onClick, icon, label, badge }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors min-w-0 shrink-0 ${
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
    }`}
  >
    {icon}
    {label}
    {badge && (
      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
    )}
</button>
);

const ActionButton: React.FC<{
  active: boolean;
  running?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, running, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={running ? "Agent running" : label}
    className={`relative flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors min-w-0 shrink-0 ${
      active || running
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
    }`}
  >
    {icon}
    {label}
    {running && (
      <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
    )}
  </button>
);

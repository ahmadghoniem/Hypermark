import React from 'react';
import {
  ActionMenu,
  ActionMenuDivider,
  ActionMenuItem,
  ActionMenuSectionLabel,
} from '@hypermark/ui/components/ActionMenu';
import { useTheme } from '@hypermark/ui/components/ThemeProvider';
import { THEME_MODES } from '@hypermark/ui/components/themeModes';
import { ReviewAgentsIcon } from '@hypermark/ui/components/ReviewAgentsIcon';
import { SettingsIcon } from '@hypermark/ui/components/icons/headerIcons';
import { GitHubIcon } from '@hypermark/ui/components/GitHubIcon';
import { GitLabIcon } from '@hypermark/ui/components/GitLabIcon';
import { modKey } from '@hypermark/ui/utils/platform';

export interface CompactReviewDestination {
  value: 'agent' | 'platform';
  platform: 'github' | 'gitlab';
  platformLabel: string;
  onChange: (value: 'agent' | 'platform') => void;
}

export interface CompactReviewAction {
  id: 'exit' | 'feedback' | 'approve' | 'copy' | 'note' | 'discard-finish';
  label: string;
  subtitle?: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * On the wide header, Settings, the theme picker and Export are buttons beside
 * this trigger rather than rows inside it; what is left here is the
 * review-shaped rest — layout toggles and the agent-instructions copy. The
 * version / release-notes block is gone with the update check.
 *
 * The compact touch shell is the exception: its header is a three-region grid
 * whose trailing region is one 44px target wide, so those three stay rows
 * there, alongside its stand-ins for the wide header's review actions.
 */
interface ReviewHeaderMenuProps {
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onOpenReviewSetup?: () => void;
  onCopyAgentInstructions: () => void;
  onToggleFileTree: () => void;
  onToggleSidebar: () => void;
  onOpenAnnotations?: () => void;
  compactDestination?: CompactReviewDestination;
  compactActions?: CompactReviewAction[];
  isFileTreeOpen: boolean;
  isSidebarOpen: boolean;
  compactTouchLayout?: boolean;
  agentInstructionsEnabled: boolean;
}

export const ReviewHeaderMenu: React.FC<ReviewHeaderMenuProps> = ({
  onOpenSettings,
  onOpenExport,
  onOpenReviewSetup,
  onCopyAgentInstructions,
  onToggleFileTree,
  onToggleSidebar,
  onOpenAnnotations,
  compactDestination,
  compactActions = [],
  isFileTreeOpen,
  isSidebarOpen,
  compactTouchLayout = false,
  agentInstructionsEnabled,
}) => {
  const { mode, setMode } = useTheme();

  return (
    <ActionMenu
      panelWidth="wide"
      panelClassName={compactTouchLayout
        ? 'absolute top-full right-0 mt-1 w-[min(18rem,calc(100vw-1rem))] max-h-[calc(var(--pn-viewport-height,100vh)-4.5rem-var(--pn-safe-top)-var(--pn-safe-bottom))] overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-xl z-[70]'
        : undefined
      }
      renderTrigger={({ isOpen, toggleMenu }) => (
        <button
          data-pn-touch-target
          data-pn-touch-target-icon
          onClick={toggleMenu}
          className={`relative flex h-7 items-center gap-1.5 px-1.5 lg:px-2.5 rounded-md text-xs font-medium transition-colors ${
            isOpen
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title="Options"
          aria-label="Options"
          aria-expanded={isOpen}
        >
          {isOpen ? <CloseIcon /> : <MenuIcon />}
          <span className="hidden lg:inline">Options</span>
        </button>
      )}
    >
      {({ closeMenu }) => (
        <>
          {compactTouchLayout && (compactDestination || compactActions.length > 0) && (
            <>
              <div className="px-3 py-2 space-y-2">
                <ActionMenuSectionLabel>Review</ActionMenuSectionLabel>
                {compactDestination && (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-0.5" aria-label="Review destination">
                    {(['agent', 'platform'] as const).map((destination) => {
                      const selected = compactDestination.value === destination;
                      const label = destination === 'agent' ? 'Agent' : compactDestination.platformLabel;
                      return (
                        <button
                          data-pn-touch-target
                          type="button"
                          key={destination}
                          aria-pressed={selected}
                          onClick={() => compactDestination.onChange(destination)}
                          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            selected
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {destination === 'platform'
                            ? compactDestination.platform === 'gitlab'
                              ? <GitLabIcon className="w-3.5 h-3.5" />
                              : <GitHubIcon className="w-3.5 h-3.5" />
                            : <AgentDestinationIcon />
                          }
                          <span className="truncate">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {compactActions.map((action) => (
                <ActionMenuItem
                  key={action.id}
                  onClick={() => {
                    closeMenu();
                    action.onSelect();
                  }}
                  disabled={action.disabled}
                  icon={<CompactReviewActionIcon kind={action.id} />}
                  label={action.label}
                  subtitle={action.subtitle}
                />
              ))}
              <ActionMenuDivider />
            </>
          )}

          {compactTouchLayout && (
            <>
              <div className="px-3 py-2 space-y-1.5">
                <ActionMenuSectionLabel>Theme</ActionMenuSectionLabel>
                <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
                  {THEME_MODES.map(({ id, label, Icon }) => (
                    <button
                      data-pn-touch-target
                      key={id}
                      onClick={() => {
                        closeMenu();
                        setMode(id);
                      }}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        mode === id
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <ActionMenuDivider />

              <ActionMenuItem
                onClick={() => {
                  closeMenu();
                  onOpenSettings();
                }}
                icon={<SettingsIcon />}
                label="Settings"
              />
              <ActionMenuItem
                onClick={() => {
                  closeMenu();
                  onOpenExport();
                }}
                icon={<ExportIcon />}
                label="Export"
              />
            </>
          )}

          {onOpenReviewSetup && (
            <ActionMenuItem
              onClick={() => {
                closeMenu();
                onOpenReviewSetup();
              }}
              icon={(
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16M4 10h16M4 15h16M4 20h10" />
                </svg>
              )}
              label="Set up review view"
            />
          )}
          {agentInstructionsEnabled && (
            <ActionMenuItem
              onClick={() => {
                closeMenu();
                onCopyAgentInstructions();
              }}
              icon={<ReviewAgentsIcon />}
              label="Agent Instructions"
              subtitle="Copy agent instructions for external review comments"
            />
          )}

          {onOpenAnnotations && (
            <>
              <ActionMenuDivider />
              {onOpenAnnotations && (
                <ActionMenuItem
                  onClick={() => {
                    closeMenu();
                    onOpenAnnotations();
                  }}
                  icon={<SidebarIcon />}
                  label="Annotations"
                />
              )}
            </>
          )}

          <ActionMenuDivider />

          <ActionMenuItem
            onClick={() => {
              closeMenu();
              onToggleFileTree();
            }}
            icon={<FileTreeMenuIcon />}
            label={compactTouchLayout
              ? (isFileTreeOpen ? 'Close review navigation' : 'Open review navigation')
              : (isFileTreeOpen ? 'Hide File Tree' : 'Show File Tree')
            }
            badge={compactTouchLayout ? undefined : <KbdHint keys={[modKey, 'B']} />}
          />
          {!compactTouchLayout && (
            <ActionMenuItem
              onClick={() => {
                closeMenu();
                onToggleSidebar();
              }}
              icon={<SidebarIcon />}
              label={isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
              badge={<KbdHint keys={[modKey, '.']} />}
            />
          )}
        </>
      )}
    </ActionMenu>
  );
};

const MenuIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);


/** Also rendered as a header button in App.tsx, beside the Options trigger. */
export const ExportIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const FileTreeMenuIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const KbdHint: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className="inline-flex items-center gap-0.5 ml-auto">
    {keys.map((k, i) => (
      <kbd key={i} className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded bg-muted border border-border/60 text-[10px] font-mono leading-none text-muted-foreground">
        {k}
      </kbd>
    ))}
  </span>
);

const SidebarIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4h10a2 2 0 012 2v12a2 2 0 01-2 2H9M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4M9 4v16" />
  </svg>
);


const AgentDestinationIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h8m-8 4h5m-7 7 3-3h8a3 3 0 003-3V7a3 3 0 00-3-3H5a3 3 0 00-3 3v7a3 3 0 003 3h1v3z" />
  </svg>
);

const CompactReviewActionIcon: React.FC<{ kind: CompactReviewAction['id'] }> = ({ kind }) => {
  if (kind === 'approve' || kind === 'discard-finish') {
    return (
      <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (kind === 'feedback' || kind === 'note') {
    return (
      <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z" />
      </svg>
    );
  }
  if (kind === 'copy') return <ExportIcon />;
  return <CloseIcon />;
};

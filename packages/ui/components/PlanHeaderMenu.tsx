import React from 'react';
import {
  ActionMenu,
  ActionMenuDivider,
  ActionMenuItem,
  ActionMenuSectionLabel,
} from './ActionMenu';
import { useTheme } from './ThemeProvider';
import { THEME_MODES } from './themeModes';
import { ReviewAgentsIcon } from './ReviewAgentsIcon';
import { MenuVersionSection } from './MenuVersionSection';
import { TextShimmer } from './TextShimmer';
import type { UpdateInfo } from '../hooks/useUpdateCheck';
import type { Origin } from '@hypermark/core/agents';

interface PlanHeaderMenuProps {
  appVersion: string;
  updateInfo?: UpdateInfo | null;
  origin?: Origin | null;
  isWSL?: boolean;
  onOpenSettings: () => void;
  onCopyAgentInstructions: () => void;
  onDownloadAnnotations: () => void;
  isApiMode: boolean;
  agentInstructionsEnabled: boolean;
  compactTouchLayout?: boolean;
  compactSessionActions?: CompactPlanAction[];
  compactDocumentActions?: CompactPlanAction[];
}

export interface CompactPlanAction {
  id: 'exit' | 'feedback' | 'approve' | 'copy' | 'done' | 'edit' | 'tools' | 'annotate' | 'refresh' | 'annotations' | 'review' | 'note' | 'discard-finish';
  label: string;
  subtitle?: string;
  onSelect: () => void;
  disabled?: boolean;
}

export const PlanHeaderMenu: React.FC<PlanHeaderMenuProps> = ({
  appVersion,
  updateInfo,
  origin,
  isWSL = false,
  onOpenSettings,
  onCopyAgentInstructions,
  onDownloadAnnotations,
  isApiMode,
  agentInstructionsEnabled,
  compactTouchLayout = false,
  compactSessionActions = [],
  compactDocumentActions = [],
}) => {
  const { mode, setMode } = useTheme();

  const showUpdateDot = !!updateInfo?.updateAvailable && !updateInfo.dismissed;

  return (
    <ActionMenu
      panelWidth="wide"
      panelClassName={compactTouchLayout
        ? 'absolute top-full right-0 mt-1 w-[min(18rem,calc(100vw-1rem))] max-h-[calc(var(--pn-viewport-height,100vh)-4.5rem-var(--pn-safe-top)-var(--pn-safe-bottom))] overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-xl z-[70]'
        : undefined
      }
      renderTrigger={({ isOpen, toggleMenu }) => (
        <button
          id={compactTouchLayout ? 'pn-compact-plan-options-trigger' : undefined}
          data-pn-touch-target={compactTouchLayout || undefined}
          data-pn-touch-target-icon={compactTouchLayout || undefined}
          onClick={() => {
            if (!isOpen && showUpdateDot) updateInfo?.dismiss();
            toggleMenu();
          }}
          className={`relative flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${compactTouchLayout ? 'h-11 w-11 p-0' : 'p-1.5 md:px-2.5 md:py-1'} ${
            isOpen
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title="Options"
          aria-label="Options"
          aria-expanded={isOpen}
        >
          {isOpen ? <CloseIcon /> : <MenuIcon />}
          {showUpdateDot ? (
            <TextShimmer className="hidden md:inline text-xs font-medium" duration={2.5} spread={1.5}>
              Options
            </TextShimmer>
          ) : (
            <span className="hidden md:inline">Options</span>
          )}
          {showUpdateDot && (
            <span className="absolute top-0.5 right-0.5 md:-top-0.5 md:-right-0.5 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />
          )}
        </button>
      )}
    >
      {({ closeMenu }) => (
        <>
          {compactTouchLayout && compactSessionActions.length > 0 && (
            <>
              <CompactActionSection
                label="Review"
                actions={compactSessionActions}
                closeMenu={closeMenu}
              />
              <ActionMenuDivider />
            </>
          )}

          {compactTouchLayout && compactDocumentActions.length > 0 && (
            <>
              <CompactActionSection
                label="Document"
                actions={compactDocumentActions}
                closeMenu={closeMenu}
              />
              <ActionMenuDivider />
            </>
          )}

          <div className="px-3 py-2 space-y-1.5">
            <ActionMenuSectionLabel>Theme</ActionMenuSectionLabel>
            <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-0.5">
              {THEME_MODES.map(({ id, label, Icon }) => (
                <button
                  data-pn-touch-target={compactTouchLayout || undefined}
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
          {agentInstructionsEnabled && (
            <ActionMenuItem
              onClick={() => {
                closeMenu();
                onCopyAgentInstructions();
              }}
              icon={<ReviewAgentsIcon />}
              label="Agent Instructions"
              subtitle="Copy agent instructions for external annotations"
            />
          )}

          <ActionMenuDivider />

          <ActionMenuItem
            onClick={() => {
              closeMenu();
              onDownloadAnnotations();
            }}
            icon={<DownloadIcon />}
            label="Download Annotations"
          />

          <ActionMenuDivider />

          <MenuVersionSection
            appVersion={appVersion}
            updateInfo={updateInfo}
            origin={origin}
            isWSL={isWSL}
            closeMenu={closeMenu}
          />
        </>
      )}
    </ActionMenu>
  );
};

const CompactActionSection = ({
  label,
  actions,
  closeMenu,
}: {
  label: string;
  actions: CompactPlanAction[];
  closeMenu: () => void;
}) => (
  <div className="py-1">
    <div className="px-3 py-1">
      <ActionMenuSectionLabel>{label}</ActionMenuSectionLabel>
    </div>
    {actions.map((action) => (
      <ActionMenuItem
        key={action.id}
        onClick={() => {
          closeMenu();
          action.onSelect();
        }}
        disabled={action.disabled}
        icon={<CompactPlanActionIcon kind={action.id} />}
        label={action.label}
        subtitle={action.subtitle}
      />
    ))}
  </div>
);

const CompactPlanActionIcon = ({ kind }: { kind: CompactPlanAction['id'] }) => {
  if (kind === 'review') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l2 2 4-4m6 3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (kind === 'annotations') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    );
  }
  if (kind === 'approve' || kind === 'done') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (kind === 'feedback') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    );
  }
  if (kind === 'copy') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    );
  }
  if (kind === 'edit' || kind === 'annotate') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    );
  }
  if (kind === 'tools') {
    // Eye, matching the desktop header's show/hide-tools toggle.
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
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

const SettingsIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

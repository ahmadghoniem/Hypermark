import React from 'react';
import {
  ActionMenu,
  ActionMenuItem,
} from './ActionMenu';
import { ReviewAgentsIcon } from './ReviewAgentsIcon';

/**
 * Down to the agent-specific row: Theme, Settings and Download are buttons in
 * the header itself (AppHeader), and the version / release-notes block is gone
 * entirely — the app no longer polls GitHub to tell the user a newer tag
 * exists.
 *
 * When nothing is left to show, the trigger does not render at all.
 */
interface PlanHeaderMenuProps {
  onOpenSettings: () => void;
  onCopyAgentInstructions: () => void;
  agentInstructionsEnabled: boolean;
}

export const PlanHeaderMenu: React.FC<PlanHeaderMenuProps> = ({
  onCopyAgentInstructions,
  agentInstructionsEnabled,
}) => {
  // Theme and Settings are reached from the header, so with no agent
  // instructions to copy there is nothing left to open.
  if (!agentInstructionsEnabled) return null;

  return (
    <ActionMenu
      panelWidth="wide"
      renderTrigger={({ isOpen, toggleMenu }) => (
        <button
          onClick={toggleMenu}
          className={`relative flex items-center justify-center gap-1.5 rounded-md p-1.5 text-xs font-medium transition-colors md:px-2.5 md:py-1 ${
            isOpen
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          title="Options"
          aria-label="Options"
          aria-expanded={isOpen}
        >
          {isOpen ? <CloseIcon /> : <MenuIcon />}
          <span className="hidden md:inline">Options</span>
        </button>
      )}
    >
      {({ closeMenu }) => (
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

import React from 'react';
import { ActionMenu } from '@hypermark/ui/components/ActionMenu';
import { DiffDisplayOptions } from '@hypermark/ui/components/DiffDisplayOptions';

interface ReviewHeaderMenuProps {
  onOpenSettings?: () => void;
  onOpenExport?: () => void;
  onOpenReviewSetup?: () => void;
  onCopyAgentInstructions?: () => void;
  onToggleFileTree?: () => void;
  onToggleSidebar?: () => void;
  onOpenAnnotations?: () => void;
  isFileTreeOpen?: boolean;
  isSidebarOpen?: boolean;
  agentInstructionsEnabled?: boolean;
}

export const ReviewHeaderMenu: React.FC<ReviewHeaderMenuProps> = () => {
  return (
    <ActionMenu
      panelClassName="absolute top-full right-0 mt-1 w-80 max-h-[calc(100vh-4rem)] overflow-y-auto rounded-xl border border-border bg-popover p-3 shadow-xl z-[70]"
      renderTrigger={({ isOpen, toggleMenu }) => (
        <button
          type="button"
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
      {() => <DiffDisplayOptions />}
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
export const ExportIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

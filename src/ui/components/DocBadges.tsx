/**
 * DocBadges — repo / branch / demo badge cluster at the top-left of the
 * document card.
 */

import React from 'react';

import { GitBranch01 } from '@untitledui/icons';
export interface DocBadgesProps {
  repoInfo?: { display: string; branch?: string } | null;
  showDemoBadge?: boolean;
}

export const DocBadges: React.FC<DocBadgesProps> = ({
  repoInfo,
  showDemoBadge,
}) => {
  if (!repoInfo && !showDemoBadge) return null;

  return (
    <div className="flex flex-col items-start gap-1 text-micro text-muted-foreground/50 font-mono">
      {repoInfo && (
        <div className="flex items-center gap-1.5">
          <span
            className="px-1.5 py-0.5 bg-muted/50 rounded-sm truncate max-w-64"
            title={repoInfo.display}
          >
            {repoInfo.display}
          </span>
          {repoInfo.branch && (
            <span
              className="px-1.5 py-0.5 bg-muted/30 rounded-sm max-w-48 flex items-center gap-1 overflow-hidden"
              title={repoInfo.branch}
            >
              <GitBranch01 className="size-2.5 shrink-0" />
              <span className="truncate">{repoInfo.branch}</span>
            </span>
          )}
        </div>
      )}

      {showDemoBadge && (
        <span className="px-1.5 py-0.5 rounded-sm text-micro font-mono bg-warning/15 text-foreground">
          Demo
        </span>
      )}
    </div>
  );
};

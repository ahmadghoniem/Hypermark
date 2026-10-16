import React from 'react';
import type { AlertKind } from '../../types';
import { renderProseBody } from './proseBody';
import { AlertOctagon, AlertTriangle, InfoCircle, Lightbulb02, MessageAlertSquare } from '@untitledui/icons';

interface AlertBlockProps {
  blockId: string;
  kind: AlertKind;
  body: string;
  onOpenLinkedDoc?: (path: string) => void;
  imageBaseDir?: string;
  onImageClick?: (src: string, alt: string) => void;
  githubRepo?: string;
  onNavigateAnchor?: (hash: string) => void;
}

const TITLE: Record<AlertKind, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  caution: 'Caution',
  important: 'Important',
};

const ICONS: Record<AlertKind, React.FC<{ className?: string }>> = {
  note: InfoCircle,
  tip: Lightbulb02,
  warning: AlertTriangle,
  caution: AlertOctagon,
  important: MessageAlertSquare,
};

const Icon: React.FC<{ kind: AlertKind }> = ({ kind }) => {
  const Glyph = ICONS[kind];
  return <Glyph className="size-4" />;
};

export const AlertBlock: React.FC<AlertBlockProps> = ({
  blockId, kind, body, onOpenLinkedDoc, imageBaseDir, onImageClick, githubRepo, onNavigateAnchor,
}) => {
  return (
    <div
      className={`alert alert-${kind} my-plan pl-4 pr-3 py-2 border-l-[3px]`}
      data-block-id={blockId}
      data-block-type="alert"
      data-alert-kind={kind}
    >
      <div className="alert-title flex items-center gap-2 font-semibold mb-1">
        <Icon kind={kind} />
        <span>{TITLE[kind]}</span>
      </div>
      {renderProseBody({ body, imageBaseDir, onImageClick, onOpenLinkedDoc, onNavigateAnchor, githubRepo })}
    </div>
  );
};

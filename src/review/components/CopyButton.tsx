import type React from 'react';
import { useState } from 'react';
import { copyTextToClipboard } from '@/ui/utils/clipboard';

import { Check, Copy01 } from '@untitledui/icons';
interface CopyButtonProps {
  text: string;
  className?: string;
  /** "overlay" (default): absolute-positioned, hover-reveal (parent needs group relative).
   *  "inline": normal flow, always visible, compact. */
  variant?: 'overlay' | 'inline';
  /** Optional label shown next to the icon (inline variant only). */
  label?: string;
}

const CopyIcon = () => (
  <Copy01 className="size-3" />
);

const CheckIcon = () => (
  <Check className="size-3 text-success" />
);

/** Copy-to-clipboard button with "Copied" flash. */
export const CopyButton: React.FC<CopyButtonProps> = ({ text, className = '', variant = 'overlay', label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (await copyTextToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className={`flex items-center gap-1 p-0.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${className}`}
        title={copied ? 'Copied!' : 'Copy'}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {label && (
          <span className="text-micro">
            {copied ? 'Copied' : label}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`absolute top-1.5 right-1.5 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted ${className}`}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
};

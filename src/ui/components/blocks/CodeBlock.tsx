import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Block } from '../../types';
import { copyTextToClipboard } from '../../utils/clipboard';
import { applyHighlight, codeBlockClassName } from '../../utils/codeHighlight';
import { useFenceTheme } from '../../hooks/useFenceTheme';

import { Check, Copy01 } from '@untitledui/icons';
interface CodeBlockProps {
  block: Block;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ block }) => {
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const fenceTheme = useFenceTheme();

  // Highlight on mount, on content/language change, and whenever the palette
  // changes. Language-less fences stay plain text (#1212) — nothing is guessed.
  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.className = codeBlockClassName(block.language);
      applyHighlight(codeRef.current, block.content, block.language, fenceTheme);
    }
  }, [block.content, block.language, fenceTheme]);

  const handleCopy = useCallback(async () => {
    if (await copyTextToClipboard(block.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      console.error('Failed to copy');
    }
  }, [block.content]);

  // Build className for code element
  const codeClassName = codeBlockClassName(block.language);

  return (
    <div
      className="relative group my-plan-wide"
      data-block-id={block.id}
    >
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity z-10"
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <Check className="size-4 text-success" />
        ) : (
          <Copy01 className="size-4" />
        )}
      </button>
      <pre className="rounded-lg text-[13px] overflow-x-auto bg-muted/50 border border-border/30">
        <code ref={codeRef} className={codeClassName}>{block.content}</code>
      </pre>
    </div>
  );
};

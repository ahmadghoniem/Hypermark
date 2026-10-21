import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Block } from '../../types';
import { copyTextToClipboard } from '../../utils/clipboard';
import { applyHighlight, codeBlockClassName } from '../../utils/codeHighlight';
import { useFenceTheme } from '../../hooks/useFenceTheme';
import { Button } from '../../fluid/components/button';
import { Tooltip } from '../../fluid/components/tooltip';

import { AlignLeft, Check, Copy01, Maximize01, Minimize01, SwitchHorizontal01 } from '@untitledui/icons';
interface CodeBlockProps {
  block: Block;
}

/**
 * A fenced code block: two stacked 12px cards. The shell (`surface-2`) holds
 * the header row (the language, then collapse, wrap and copy icon buttons);
 * the code card (`surface-3`) sits under it with no inset, its sides and
 * bottom on the shell's border, so only its top edge shows. The wrap button shows
 * only while a line is too long to fit (or the lines are wrapped).
 * Collapsing hides the `<pre>` instead of unmounting it, so an annotation's
 * mark inside the code survives.
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({ block }) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const fenceTheme = useFenceTheme();
  const lineCount = block.content.split('\n').length;

  // Highlight on mount, on content/language change, and whenever the palette
  // changes. Language-less fences stay plain text (#1212) — nothing is guessed.
  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.className = codeBlockClassName(block.language);
      applyHighlight(codeRef.current, block.content, block.language, fenceTheme);
    }
  }, [block.content, block.language, fenceTheme]);

  // Whether a line runs past the block's width. Measured only while the lines
  // scroll; wrapped lines never overflow, and the button stays to unwrap them.
  useEffect(() => {
    const pre = preRef.current;
    if (!pre || wrapped || collapsed) return;
    const measure = () => setOverflows(pre.scrollWidth > pre.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pre);
    return () => observer.disconnect();
  }, [wrapped, collapsed, block.content]);

  const handleCopy = useCallback(async () => {
    if (await copyTextToClipboard(block.content)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      console.error('Failed to copy');
    }
  }, [block.content]);

  const codeClassName = codeBlockClassName(block.language);

  return (
    <div
      className="my-plan-wide overflow-hidden rounded-[12px] border border-border/40 bg-surface-2"
      data-block-id={block.id}
    >
      <div data-pinpoint-ignore="" className="flex h-9 select-none items-center gap-0.5 pr-1 pl-3">
        <span className="flex-1 font-mono text-caption text-muted-foreground">{block.language || 'text'}</span>
        <Tooltip content={collapsed ? 'Expand' : 'Collapse'} side="top">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? 'Expand code' : 'Collapse code'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <Maximize01 /> : <Minimize01 />}
          </Button>
        </Tooltip>
        {(overflows || wrapped) && !collapsed && (
          <Tooltip content={wrapped ? 'Unwrap' : 'Wrap'} side="top">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={wrapped ? 'Unwrap lines' : 'Wrap lines'}
              aria-pressed={wrapped}
              onClick={() => setWrapped((w) => !w)}
            >
              {wrapped ? <AlignLeft /> : <SwitchHorizontal01 />}
            </Button>
          </Tooltip>
        )}
        <Tooltip content={copied ? 'Copied' : 'Copy'} side="top">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={copied ? 'Copied' : 'Copy code'}
            className={copied ? 'text-success hover:text-success' : undefined}
            onClick={handleCopy}
          >
            {copied ? <Check /> : <Copy01 />}
          </Button>
        </Tooltip>
      </div>
      <div className="-mx-px -mb-px overflow-hidden rounded-[12px] border border-border/40 bg-surface-3">
        {collapsed && (
          <p data-pinpoint-ignore="" className="select-none px-3 py-2.5 text-caption text-muted-foreground italic">
            {lineCount} hidden lines
          </p>
        )}
        <pre ref={preRef} hidden={collapsed} className={`text-[13px] ${wrapped ? 'whitespace-pre-wrap wrap-break-word [&>code]:whitespace-pre-wrap!' : 'overflow-x-auto'}`}>
          <code ref={codeRef} className={codeClassName}>{block.content}</code>
        </pre>
      </div>
    </div>
  );
};

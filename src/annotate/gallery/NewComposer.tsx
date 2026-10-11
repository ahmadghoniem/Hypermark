import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ImagePlus, X } from 'lucide-react';
import { Tooltip } from '@/ui/fluid/components/tooltip';
import { FileThumbnail } from '@/ui/fluid/components/file-thumbnail';
import { ComposerQuickLabels } from '@/ui/components/ComposerQuickLabels';
import type { QuickLabel } from '@/ui/utils/quickLabels';
import { copyTextToClipboard } from '@/ui/utils/clipboard';
import { imageFilesFrom } from '@/ui/hooks/useAttachmentUploads';

interface NewComposerProps {
  quote: string;
  quickLabels: readonly QuickLabel[];
  onSubmit: (text: string, files: File[]) => void;
  onQuickLabel: (label: QuickLabel) => void;
}

const THUMB = 44;

/**
 * Mock of the reworked composer, for the gallery only. Quote row with a bar
 * on the left and Copy on the right, the text field with the quick-label row,
 * image tiles above the action row, an attach icon on the left and a round
 * send icon on the right. Ctrl+Enter adds, Escape discards.
 */
export const NewComposer: React.FC<NewComposerProps> = ({ quote, quickLabels, onSubmit, onQuickLabel }) => {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasContent = text.trim().length > 0 || files.length > 0;

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copyQuote = useCallback(() => {
    void copyTextToClipboard(quote).then((ok) => { if (ok) setCopied(true); });
  }, [quote]);

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length > 0) setFiles((prev) => [...prev, ...incoming]);
  }, []);

  const submit = useCallback(() => {
    if (!hasContent) return;
    onSubmit(text.trim(), files);
    setText('');
    setFiles([]);
  }, [hasContent, onSubmit, text, files]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setText('');
      setFiles([]);
    } else if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
      const el = e.currentTarget;
      if (el.selectionStart === el.selectionEnd) {
        e.preventDefault();
        copyQuote();
      }
    }
  };

  return (
    <div className="w-86 rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.18),0_25px_50px_-12px_rgb(0_0_0/0.5)]">
      <div className="flex flex-col overflow-hidden rounded-[13px] bg-muted/40">
        {/* Quote row: the bar stands for the highlight, Copy on the right. */}
        <div className="flex min-h-7 items-center gap-2 px-3 py-1">
          <span aria-hidden="true" className="h-3.5 w-0.5 shrink-0 bg-[oklch(0.86_0.17_95)]" />
          <span className="min-w-0 flex-1 truncate text-2xs/snug text-muted-foreground">{quote}</span>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={copyQuote}
            title="Copy the highlighted text (Ctrl+C)"
            aria-label={copied ? 'Copied' : 'Copy the highlighted text'}
            className="-mr-1.5 grid shrink-0 rounded-md px-1.5 py-0.5 text-2xs/snug text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden="true" className={`col-start-1 row-start-1 justify-self-end transition-[opacity,translate] duration-150 ${copied ? '-translate-y-1 opacity-0' : ''}`}>Copy</span>
            <span aria-hidden="true" className={`col-start-1 row-start-1 justify-self-end whitespace-nowrap text-success transition-[opacity,translate] duration-150 ${copied ? '' : 'translate-y-1 opacity-0'}`}>Copied ✓</span>
          </button>
        </div>

        <div
          className="flex flex-col rounded-[13px] border border-border/50 bg-popover shadow-[0_1px_1px_rgb(0_0_0/0.16),0_2px_4px_-2px_rgb(0_0_0/0.3)]"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(imageFilesFrom(e.dataTransfer)); }}
        >
          <div className="relative flex min-h-20 flex-col justify-between px-3.25 pb-0.5 pt-2.5">
            <textarea
              ref={textareaRef}
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={(e) => {
                const pasted = imageFilesFrom(e.clipboardData);
                if (pasted.length > 0) { e.preventDefault(); addFiles(pasted); }
              }}
              placeholder="What's your feedback?"
              className="max-h-64 min-h-14 w-full resize-none overflow-y-auto bg-transparent px-1 py-0.5 text-[12.5px] leading-[1.45] placeholder:text-muted-foreground focus:outline-none"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <ComposerQuickLabels labels={quickLabels} onSelect={onQuickLabel} hidden={hasContent} chipHeight={24} gap={6} fade={36} />
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3.25 pt-1.5">
              {files.map((file, i) => (
                <div key={`${file.name}-${i}`} className="group relative">
                  <FileThumbnail file={file} size={THUMB} radius={6} />
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full border border-border bg-popover text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-2 pb-1.75 pt-1.5">
            <Tooltip content="Attach image" side="bottom">
              <button
                type="button"
                aria-label="Attach image"
                onClick={() => fileInputRef.current?.click()}
                className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ImagePlus size={15} strokeWidth={1.75} />
              </button>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
            />
            <Tooltip
              side="bottom"
              content={(
                <span className="flex items-center gap-2">
                  Add comment
                  <span className="flex gap-0.5 text-muted-foreground">
                    <kbd className="rounded-sm border border-border px-1 font-sans text-3xs">Ctrl</kbd>
                    <kbd className="rounded-sm border border-border px-1 font-sans text-3xs">Enter</kbd>
                  </span>
                </span>
              )}
            >
              <button
                type="button"
                aria-label="Add comment"
                onClick={submit}
                aria-disabled={!hasContent}
                className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:opacity-40"
              >
                <ArrowUp size={15} strokeWidth={2.25} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};

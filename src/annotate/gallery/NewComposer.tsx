import React, { useCallback, useState } from 'react';
import { ArrowUp, CornerDownLeft, Image01, ImagePlus, Tag01, XClose } from '@untitledui/icons';
import { Button } from '@/ui/fluid/components/button';
import { Tooltip } from '@/ui/fluid/components/tooltip';
import { QuoteText } from '@/ui/components/QuoteText';
import type { QuickLabel } from '@/ui/utils/quickLabels';
import { copyTextToClipboard } from '@/ui/utils/clipboard';
import { imageFilesFrom } from '@/ui/hooks/useAttachmentUploads';

interface NewComposerProps {
  quote: string;
  quickLabels: readonly QuickLabel[];
  onSubmit: (text: string, files: File[]) => void;
  /** Icon and style for send, so the gallery can compare them. */
  sendIcon?: Icon;
  sendVariant?: SendVariant;
  /** Opens the side chat with the typed text as the question (the field is
   *  cleared). Send on text starting with /btw, or Alt+Enter, calls it. */
  onAsk?: (question: string) => void;
  /** Shows "Save as quick label" on the quote row once the text isn't a label yet. */
  onSaveLabel?: (text: string) => void;
  autoFocus?: boolean;
}

export type Icon = React.ComponentType<{ size?: number; className?: string }>;
export type SendVariant = 'primary' | 'ghost';

/** Dark tooltip with a border, in place of Fluid's inverted one. */
const TIP = 'border border-border bg-popover text-foreground shadow-md';

const TEXT = 'text-body/normal';

/**
 * The rest of the first label the text is a prefix of (the first label when
 * the field is empty), ignoring case. Nothing once the text is a whole label,
 * so an accepted label stays put.
 */
function suggestionFor(text: string, labels: readonly string[]) {
  const lower = text.toLowerCase();
  const match = labels.find((l) => l.length > text.length && l.toLowerCase().startsWith(lower));
  return match ? { rest: match.slice(text.length), label: match } : null;
}

/** "screenshot.png" -> ["screenshot", ".png"], so the name truncates and the
 *  extension stays visible. */
function splitName(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

/**
 * Mock of the reworked composer, for the gallery only. One flat card with
 * InputMessage's 8px inset: the quoted text (Ctrl+C with nothing selected
 * copies it), the text field, the attached files as name chips (only once
 * there are some), and a bottom row with attach on the left and send on the
 * right. Text starting with /btw is a side question: send turns into ArrowUp
 * and opens the side chat instead of adding a comment. The buttons are
 * Fluid's: ghost for the icons, primary for send. The edge is
 * InputMessage's 1px ring (Fluid's surface-2 shadow), under the popover's
 * drop shadow.
 *
 * Quick labels have no chips: the field offers them as a ghost completion.
 * Empty, it shows the first label; typing narrows to the first label the text
 * starts. Tab accepts it. Ctrl+Enter adds, Escape discards.
 */
export const NewComposer: React.FC<NewComposerProps> = ({
  quote, quickLabels, onSubmit, sendIcon: SendIcon = CornerDownLeft, sendVariant = 'primary',
  onAsk, onSaveLabel, autoFocus = true,
}) => {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [copyFlash, setCopyFlash] = useState(0);
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasContent = text.trim().length > 0 || files.length > 0;

  const labels = quickLabels.map((l) => l.text);
  // "/" completes to the side question command the same way text completes to a label.
  const suggestion = caretAtEnd ? suggestionFor(text, onAsk && text.startsWith('/') ? ['/btw '] : labels) : null;
  const trimmed = text.trim();
  const btw = !!onAsk && /^\/btw(\s|$)/i.test(trimmed);
  const canSaveLabel = !!onSaveLabel && trimmed.length > 0 && !trimmed.startsWith('/')
    && !labels.some((l) => l.toLowerCase() === trimmed.toLowerCase());

  const ask = useCallback((question: string) => {
    if (!onAsk) return;
    onAsk(question);
    setText('');
  }, [onAsk]);

  const copyQuote = useCallback(() => {
    void copyTextToClipboard(quote).then((ok) => { if (ok) setCopyFlash((n) => n + 1); });
  }, [quote]);

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length > 0) setFiles((prev) => [...prev, ...incoming]);
  }, []);

  const submit = useCallback(() => {
    if (!hasContent) return;
    const t = text.trim();
    if (onAsk && t.toLowerCase().startsWith('/btw')) {
      ask(t.slice(4).trim());
      return;
    }
    onSubmit(t, files);
    setText('');
    setFiles([]);
  }, [hasContent, onSubmit, onAsk, ask, text, files]);

  const trackCaret = (el: HTMLTextAreaElement) =>
    setCaretAtEnd(el.selectionStart === el.selectionEnd && el.selectionEnd === el.value.length);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.altKey && onAsk && !e.nativeEvent.isComposing) {
      e.preventDefault();
      ask(trimmed);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && suggestion) {
      e.preventDefault();
      setText(suggestion.label);
      setCaretAtEnd(true);
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
    <div
      data-comment-popover="true"
      className="flex w-90 flex-col rounded-xl bg-popover p-2 shadow-[var(--fl-shadow-2),0_25px_50px_-12px_rgb(0_0_0/0.5)]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); addFiles(imageFilesFrom(e.dataTransfer)); }}
    >
      <div className="flex items-center gap-2 px-1.5 py-0.5">
        <span aria-hidden="true" className="h-4 w-0.5 shrink-0 rounded-full bg-muted-foreground/35" />
        <QuoteText flash={copyFlash} onDone={() => setCopyFlash(0)} className="flex-1 text-caption text-muted-foreground">
          {quote}
        </QuoteText>
        {canSaveLabel && (
          <Tooltip content="Save as quick label" side="top" className={TIP}>
            <Button variant="ghost" size="icon-sm" aria-label="Save as quick label" className="-my-1.5" onClick={() => onSaveLabel?.(trimmed)}>
              <Tag01 />
            </Button>
          </Tooltip>
        )}
      </div>

      <div className="px-1.5 pt-2.5">
        <div className="relative">
          <textarea
            autoFocus={autoFocus}
            value={text}
            onChange={(e) => { setText(e.target.value); trackCaret(e.target); }}
            onSelect={(e) => trackCaret(e.currentTarget)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              const pasted = imageFilesFrom(e.clipboardData);
              if (pasted.length > 0) { e.preventDefault(); addFiles(pasted); }
            }}
            placeholder={labels.length > 0 ? undefined : "What's your feedback?"}
            aria-describedby={suggestion ? 'new-composer-suggestion' : undefined}
            className={`block max-h-64 min-h-10 w-full resize-none overflow-y-auto bg-transparent placeholder:text-muted-foreground focus:outline-none ${TEXT}`}
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          {/* Ghost completion: the typed text, invisible, so the rest lines up
              after it, then the Tab key. */}
          {suggestion && (
            <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 whitespace-pre-wrap wrap-break-word ${TEXT}`}>
              <span className="invisible">{text}</span>
              <span className="text-muted-foreground">{suggestion.rest}</span>
              <kbd className="ml-1.5 inline-flex h-4 -translate-y-px items-center rounded-[5px] border border-border bg-background px-1 align-middle font-sans text-micro text-muted-foreground">
                Tab
              </kbd>
            </div>
          )}
          {suggestion && (
            <span id="new-composer-suggestion" className="sr-only">
              Press Tab for {suggestion.label}
            </span>
          )}
        </div>
      </div>

      {/* The attached files as name chips. */}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5 pt-2">
          {files.map((file, i) => {
            const [base, ext] = splitName(file.name);
            return (
              <span
                key={`${file.name}-${i}`}
                title={file.name}
                className="inline-flex h-6.5 min-w-0 max-w-48 items-center gap-1.5 rounded-md bg-muted/60 pl-2 pr-1 text-caption text-foreground/90"
              >
                <Image01 size={14} className="shrink-0 text-muted-foreground" />
                <span className="flex min-w-0">
                  <span className="truncate">{base}</span>
                  <span className="shrink-0">{ext}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  className="grid size-4.5 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <XClose size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
      />

      <div className="flex items-center justify-between pt-2">
        <Tooltip content="Attach image" side="top" className={TIP}>
          <Button variant="ghost" size="icon-sm" aria-label="Attach image" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus />
          </Button>
        </Tooltip>
        <Tooltip
          side="top"
          className={TIP}
          content={(
            <span className="flex items-center gap-2 whitespace-nowrap">
              {btw ? 'Ask a side question' : 'Add comment'}
              <span className="text-muted-foreground">Ctrl Enter</span>
            </span>
          )}
        >
          <Button variant={sendVariant} size="icon-sm" aria-label={btw ? 'Ask a side question' : 'Add comment'} onClick={submit} disabled={!hasContent}>
            {/* InputMessage's send glyph: 19px over icon-sm's 14px. */}
            {btw ? <ArrowUp size={19} className="size-4.75!" /> : <SendIcon size={19} className="size-4.75!" />}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

import React, { useCallback, useState } from 'react';
import { ArrowUp, Image01, ImagePlus, MessageQuestionCircle, XClose } from '@untitledui/icons';
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
}

/** Dark tooltip with a border, in place of Fluid's inverted one. */
const TIP = 'border border-border bg-popover text-foreground shadow-md';

const TEXT = 'text-sm/normal';

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
 * copies it), the text field, a row with the attached files as name chips
 * followed by the attach icon, and a bottom row with the side question (/btw,
 * not wired yet) on the left and send on the right. The buttons are Fluid's,
 * as in InputMessage: ghost for the icons, primary for send.
 *
 * Quick labels have no chips: the field offers them as a ghost completion.
 * Empty, it shows the first label; typing narrows to the first label the text
 * starts. Tab accepts it. Ctrl+Enter adds, Escape discards.
 */
export const NewComposer: React.FC<NewComposerProps> = ({ quote, quickLabels, onSubmit }) => {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [copyFlash, setCopyFlash] = useState(0);
  const [caretAtEnd, setCaretAtEnd] = useState(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasContent = text.trim().length > 0 || files.length > 0;

  const labels = quickLabels.map((l) => l.text);
  const suggestion = caretAtEnd ? suggestionFor(text, labels) : null;

  const copyQuote = useCallback(() => {
    void copyTextToClipboard(quote).then((ok) => { if (ok) setCopyFlash((n) => n + 1); });
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

  const trackCaret = (el: HTMLTextAreaElement) =>
    setCaretAtEnd(el.selectionStart === el.selectionEnd && el.selectionEnd === el.value.length);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
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
      className="flex w-90 flex-col rounded-xl border border-border bg-popover p-2 shadow-[0_1px_2px_rgb(0_0_0/0.18),0_25px_50px_-12px_rgb(0_0_0/0.5)]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); addFiles(imageFilesFrom(e.dataTransfer)); }}
    >
      <div className="flex items-center gap-2 pl-1.5">
        <span aria-hidden="true" className="h-4 w-0.5 shrink-0 rounded-full bg-muted-foreground/35" />
        <QuoteText flash={copyFlash} onDone={() => setCopyFlash(0)} className="flex-1 text-xs text-muted-foreground">
          {quote}
        </QuoteText>
      </div>

      <div className="relative px-1.5 pt-3">
        <textarea
          autoFocus
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
          <div aria-hidden="true" className={`pointer-events-none absolute inset-x-1.5 top-3 whitespace-pre-wrap wrap-break-word ${TEXT}`}>
            <span className="invisible">{text}</span>
            <span className="text-muted-foreground">{suggestion.rest}</span>
            <kbd className="ml-1.5 inline-flex h-4 -translate-y-px items-center rounded-[5px] border border-border bg-background px-1 align-middle font-sans text-4xs text-muted-foreground">
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

      {/* The attached files as name chips, then the attach icon. */}
      <div className="flex flex-wrap items-center gap-1.5 px-0.5 pt-3">
        {files.map((file, i) => {
          const [base, ext] = splitName(file.name);
          return (
            <span
              key={`${file.name}-${i}`}
              title={file.name}
              className="inline-flex h-6.5 min-w-0 max-w-48 items-center gap-1.5 rounded-md bg-muted/60 pl-2 pr-1 text-xs text-foreground/90"
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
        <Tooltip content="Attach image" side="top" className={TIP}>
          <Button variant="ghost" size="icon-sm" aria-label="Attach image" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus />
          </Button>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <Tooltip
          side="top"
          className={TIP}
          content={(
            <span className="flex items-center gap-2 whitespace-nowrap">
              Ask a side question
              <span className="text-muted-foreground">/btw</span>
            </span>
          )}
        >
          <Button variant="ghost" size="icon-sm" aria-label="Ask a side question">
            <MessageQuestionCircle />
          </Button>
        </Tooltip>
        <Tooltip
          side="top"
          className={TIP}
          content={(
            <span className="flex items-center gap-2 whitespace-nowrap">
              Add comment
              <span className="text-muted-foreground">Ctrl Enter</span>
            </span>
          )}
        >
          <Button variant="primary" size="icon-sm" aria-label="Add comment" onClick={submit} disabled={!hasContent}>
            {/* InputMessage's send glyph: 19px over icon-sm's 14px. */}
            <ArrowUp size={19} className="size-4.75!" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};

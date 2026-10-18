import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, StopSquare, XClose } from '@untitledui/icons';
import { Button } from '@/ui/fluid/components/button';
import { ThinkingIndicator } from '@/ui/fluid/components/thinking-indicator';
import { Tooltip } from '@/ui/fluid/components/tooltip';
import type { SideChatThread } from '../hooks/useSideChat';
import { AutoGrowBox } from './AutoGrowBox';

const TIP = 'border border-border bg-popover text-foreground shadow-md';

interface SideChatCardProps {
  thread: SideChatThread;
  onSend: (question: string) => void;
  /** Stops the answer being written; the text so far stays. */
  onStop: () => void;
  onClose: () => void;
  /** Sits left of the message rail, which shows at lg and up. */
  clearRail?: boolean;
}

/**
 * The /btw side conversation about a highlight: a card in the bottom right
 * corner of the host, which must be positioned (the annotate app puts it in
 * the document area, left of the panel). 384px wide and 448px tall,
 * 8px off the bottom, shrinking to fit a short host. Escape inside it
 * closes it. The thread is never part of the feedback.
 */
export const SideChatCard: React.FC<SideChatCardProps> = ({ thread, onSend, onStop, onClose, clearRail = false }) => {
  const { quote, messages, pending, error } = thread;
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const last = messages[messages.length - 1];
  // The thinking indicator shows until the first chunk of the answer arrives.
  const thinking = pending && last?.role !== 'assistant';

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, last?.text, pending, error]);

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div
      role="dialog"
      aria-label="Side question"
      data-popover-layer
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      className={`absolute right-4 bottom-2 z-popover flex h-112 max-h-[calc(100%-1rem)] min-h-60 w-96 max-w-[calc(100%-2rem)] flex-col rounded-xl bg-popover shadow-[var(--shadow-3),0_6px_18px_0_rgb(0_0_0/0.12)] ${
        clearRail ? 'lg:right-18 lg:max-w-[calc(100%-5.5rem)]' : ''
      }`}
    >
      <div className="flex shrink-0 items-start gap-1 p-1.5 pl-3">
        <p className="mt-1 line-clamp-2 min-w-0 flex-1 border-l-2 border-border pl-2 text-caption text-muted-foreground">{quote}</p>
        <Tooltip content={<span className="flex items-center gap-2">Close<span className="text-muted-foreground">Esc</span></span>} side="top" className={TIP}>
          <Button variant="ghost" size="icon-sm" aria-label="Close side question" onClick={onClose}>
            <XClose />
          </Button>
        </Tooltip>
      </div>

      <div ref={threadRef} className="scroll-fade-top flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
        {messages.map((m, i) => (m.role === 'user' ? (
          <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-muted/60 px-2.5 py-1.5 text-body text-foreground">
            {m.text}
          </div>
        ) : (
          <div key={i} className="whitespace-pre-wrap text-body text-foreground/90">{m.text}</div>
        )))}
        {thinking && <ThinkingIndicator size="compact" className="text-muted-foreground" />}
        {error && !pending && <div role="alert" className="text-caption text-destructive">{error}</div>}
      </div>

      <div className="p-2 pt-0">
        {/* A press anywhere in the box but its buttons types into the reply. */}
        <div
          className="flex cursor-text flex-col rounded-lg border border-border p-1.5 pl-2.5"
          onMouseDown={(e) => {
            if (e.target === replyRef.current || (e.target as Element).closest('button')) return;
            e.preventDefault();
            replyRef.current?.focus();
          }}
        >
          <AutoGrowBox value={draft}>
            <textarea
              ref={replyRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
              }}
              aria-label="Reply"
              placeholder="Reply"
              className="block max-h-32 min-h-7 resize-none bg-transparent py-1 text-body placeholder:text-muted-foreground focus:outline-none"
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
          </AutoGrowBox>
          {pending ? (
            <Tooltip content="Stop" side="top" className={TIP}>
              <Button variant="secondary" size="icon-sm" aria-label="Stop" className="self-end" onClick={onStop}>
                <StopSquare className="size-3.5" />
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content={<span className="flex items-center gap-2">Send<span className="text-muted-foreground">Enter</span></span>} side="top" className={TIP}>
              <Button variant="primary" size="icon-sm" aria-label="Send" className="self-end" onClick={send} disabled={!draft.trim()}>
                <ArrowUp size={19} className="size-4.75!" />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};

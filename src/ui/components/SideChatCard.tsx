import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, XClose } from '@untitledui/icons';
import { Button } from '@/ui/fluid/components/button';
import { Tooltip } from '@/ui/fluid/components/tooltip';
import type { SideChatThread } from '../hooks/useSideChat';
import { AutoGrowBox } from './AutoGrowBox';

const TIP = 'border border-border bg-popover text-foreground shadow-md';

interface SideChatCardProps {
  thread: SideChatThread;
  onSend: (question: string) => void;
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
export const SideChatCard: React.FC<SideChatCardProps> = ({ thread, onSend, onClose, clearRail = false }) => {
  const { quote, messages, pending, error } = thread;
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending, error]);

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
      className={`absolute right-4 bottom-2 z-popover flex h-112 max-h-[calc(100%-1rem)] min-h-60 w-96 max-w-[calc(100%-2rem)] flex-col rounded-xl bg-popover shadow-[var(--fl-shadow-2),0_25px_50px_-12px_rgb(0_0_0/0.25)] ${
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

      <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
        {messages.map((m, i) => (m.role === 'user' ? (
          <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-muted/60 px-2.5 py-1.5 text-body text-foreground">
            {m.text}
          </div>
        ) : (
          <div key={i} className="whitespace-pre-wrap text-body text-foreground/90">{m.text}</div>
        )))}
        {pending && <div role="status" className="animate-pulse text-caption text-muted-foreground">Thinking…</div>}
        {error && !pending && <div role="alert" className="text-caption text-destructive">{error}</div>}
      </div>

      <div className="p-2 pt-0">
        <div className="flex flex-col rounded-lg border border-border p-1.5 pl-2.5">
          <AutoGrowBox value={draft}>
            <textarea
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
          <Tooltip content={<span className="flex items-center gap-2">Send<span className="text-muted-foreground">Enter</span></span>} side="top" className={TIP}>
            <Button variant="primary" size="icon-sm" aria-label="Send" className="self-end" onClick={send} disabled={!draft.trim() || pending}>
              <ArrowUp size={19} className="size-4.75!" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

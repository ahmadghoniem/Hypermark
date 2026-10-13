import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Maximize02, Minimize02, XClose } from '@untitledui/icons';
import { Button } from '@/ui/fluid/components/button';
import { Tooltip } from '@/ui/fluid/components/tooltip';
import { TabsSubtle, TabsSubtleItem } from '@/ui/fluid/components/tabs-subtle';
import type { QuickLabel } from '@/ui/utils/quickLabels';
import { NewComposer, type Icon, type SendVariant } from './NewComposer';

interface Message { role: 'user' | 'assistant'; text: string }

/** Where the side chat opens. */
export type SideChatLayout = 'card' | 'column' | 'panel' | 'inline';

export const SIDE_CHAT_LAYOUTS: { name: string; layout: SideChatLayout; note: string }[] = [
  { name: 'Corner card', layout: 'card', note: 'A small card in the document\'s bottom right corner. Expand makes it full height and wider.' },
  { name: 'Column', layout: 'column', note: 'A column between the document and the annotations panel. The document gets narrower while it is open.' },
  { name: 'In the panel', layout: 'panel', note: 'A Side chat tab in the annotations panel. Nothing new on screen; the panel switches to it when you ask.' },
  { name: 'Under the highlight', layout: 'inline', note: 'The thread opens where the composer was, under the highlight. Closing it brings the composer back.' },
];

const TIP = 'border border-border bg-popover text-foreground shadow-md';

/** Canned answers, long enough to show how a real reply fills the window. */
const REPLIES = [
  'It means the session stays open after you follow the link, so nothing needs to be restarted.\n\n'
    + 'The second half is about layout: the link text runs straight into the inline code someCode() with no space, '
    + 'so the two read as one item. Inline code can\'t break, so the browser moves the whole thing to the next line, '
    + 'which is the wrap the agent mentions.\n\n'
    + 'If your annotation is about readability, ask for a space or punctuation between the link and the code. '
    + 'Changing the wrap width won\'t fix it.',
  'Yes. Any long identifier in inline code will wrap the same way, because it can\'t be split. '
    + 'The agent only noticed it here because the link text ran into it.',
  'From the conversation, it means the session. The paragraph before this one is about keeping it open while you review.',
];

const SAMPLE_QUESTION = 'What does "still open" refer to here?';

const CloseButton: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Tooltip content={<span className="flex items-center gap-2">Close<span className="text-muted-foreground">Esc</span></span>} side="top" className={TIP}>
    <Button variant="ghost" size="icon-sm" aria-label="Close side question" onClick={onClose}>
      <XClose />
    </Button>
  </Tooltip>
);

/** The quote the chat is about, the messages, and the reply box. Every layout uses it as-is. */
const Thread: React.FC<{
  quote: string;
  messages: Message[];
  pending: boolean;
  sendVariant: SendVariant;
  onSend: (text: string) => void;
}> = ({ quote, messages, pending, sendVariant, onSend }) => {
  const [draft, setDraft] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending]);

  const send = () => {
    if (!draft.trim() || pending) return;
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <>
      <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
        <p className="line-clamp-2 border-l-2 border-border pl-2 text-caption text-muted-foreground">{quote}</p>
        {messages.length === 0 && !pending && (
          <p className="m-auto text-caption text-muted-foreground">Ask about the highlight.</p>
        )}
        {messages.map((m, i) => (m.role === 'user' ? (
          <div key={i} className="max-w-[85%] self-end whitespace-pre-wrap rounded-lg bg-muted/60 px-2.5 py-1.5 text-body text-foreground">
            {m.text}
          </div>
        ) : (
          <div key={i} className="whitespace-pre-wrap text-body text-foreground/90">{m.text}</div>
        )))}
        {pending && <div className="animate-pulse text-caption text-muted-foreground">Thinking…</div>}
      </div>

      <div className="p-2 pt-0">
        <div className="flex flex-col rounded-lg border border-border p-1.5 pl-2.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            placeholder="Reply"
            className="block max-h-32 min-h-7 resize-none bg-transparent py-1 text-body placeholder:text-muted-foreground focus:outline-none"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <Tooltip content={<span className="flex items-center gap-2">Send<span className="text-muted-foreground">Enter</span></span>} side="top" className={TIP}>
            <Button variant={sendVariant} size="icon-sm" aria-label="Send" className="self-end" onClick={send} disabled={!draft.trim() || pending}>
              <ArrowUp size={19} className="size-4.75!" />
            </Button>
          </Tooltip>
        </div>
      </div>
    </>
  );
};

/** Escape anywhere inside closes the chat. */
const closeOnEscape = (onClose: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Escape') { e.preventDefault(); onClose(); }
};

const DocText: React.FC<{ quote: string }> = ({ quote }) => (
  <div className="flex max-w-[60ch] flex-col gap-3 text-body text-foreground/90">
    <p>
      After you follow the link, nothing else needs to happen.{' '}
      <mark className="bg-[oklch(0.86_0.17_95/0.35)] text-foreground">{quote}</mark>, which is why it looks like two items.
    </p>
    <p className="mt-56">
      The rest of the change is unrelated: the retry count moves to the config file, and the old flag is removed.
      Nothing else in the review needs a decision.
    </p>
  </div>
);

const NoAnnotations: React.FC = () => (
  <p className="m-auto text-caption text-muted-foreground">No annotations yet</p>
);

/**
 * A page-sized frame with the document, the composer under the highlight, the
 * annotations panel, and the side chat in the chosen layout. Sending text that
 * starts with /btw opens the chat with the rest as the first question. The
 * thread is kept when the layout changes. Replies are canned.
 */
export const SideChatDemo: React.FC<{
  layout: SideChatLayout;
  quote: string;
  quickLabels: readonly QuickLabel[];
  sendIcon: Icon;
  sendVariant: SendVariant;
  onSubmit: (text: string, files: File[]) => void;
  onSaveLabel: (text: string) => void;
}> = ({ layout, quote, sendVariant, ...composer }) => {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [panelTab, setPanelTab] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);

  const send = useCallback((text: string) => {
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setPending(true);
    window.setTimeout(() => {
      setMessages((prev) => [...prev, { role: 'assistant', text: REPLIES[Math.min(Math.floor(prev.length / 2), REPLIES.length - 1)] }]);
      setPending(false);
    }, 900);
  }, []);

  const ask = useCallback((question: string) => {
    setOpen(true);
    setPanelTab(1);
    if (question) send(question);
  }, [send]);

  const close = useCallback(() => {
    setOpen(false);
    setPanelTab(0);
  }, []);

  const thread = <Thread quote={quote} messages={messages} pending={pending} sendVariant={sendVariant} onSend={send} />;
  const composerHidden = open && layout === 'inline';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <button
          type="button"
          onClick={() => ask(messages.length === 0 ? SAMPLE_QUESTION : '')}
          className="inline-flex h-7 items-center rounded-md bg-muted px-2 text-foreground transition-colors hover:bg-muted/70"
        >
          {messages.length === 0 ? 'Ask a sample question' : 'Open the chat'}
        </button>
        <span>or type /btw in the composer.</span>
      </div>

      <div className="relative flex h-150 overflow-hidden rounded-lg border border-border bg-background">
        <div className="relative min-w-0 flex-1 p-6">
          <DocText quote={quote} />
          {!composerHidden && (
            <div className="absolute left-6 top-28">
              <NewComposer {...composer} quote={quote} sendVariant={sendVariant} autoFocus={false} onAsk={ask} />
            </div>
          )}

          {open && layout === 'card' && (
            <div
              role="dialog"
              aria-label="Side question"
              onKeyDown={closeOnEscape(close)}
              className={`absolute bottom-3 right-3 z-10 flex flex-col rounded-xl bg-popover shadow-[var(--fl-shadow-2),0_25px_50px_-12px_rgb(0_0_0/0.5)] ${
                expanded ? 'top-3 w-120' : 'h-96 w-72'
              }`}
            >
              <div className="flex justify-end gap-0.5 p-1.5">
                <Tooltip content={expanded ? 'Shrink' : 'Expand'} side="top" className={TIP}>
                  <Button variant="ghost" size="icon-sm" aria-label={expanded ? 'Shrink' : 'Expand'} onClick={() => setExpanded((v) => !v)}>
                    {expanded ? <Minimize02 /> : <Maximize02 />}
                  </Button>
                </Tooltip>
                <CloseButton onClose={close} />
              </div>
              {thread}
            </div>
          )}

          {open && layout === 'inline' && (
            <div
              role="dialog"
              aria-label="Side question"
              onKeyDown={closeOnEscape(close)}
              className="absolute left-6 top-28 z-10 flex size-96 flex-col rounded-xl bg-popover shadow-[var(--fl-shadow-2),0_25px_50px_-12px_rgb(0_0_0/0.5)]"
            >
              <div className="flex items-center justify-between py-1.5 pl-3 pr-1.5">
                <span className="text-caption font-medium text-foreground">Side question</span>
                <CloseButton onClose={close} />
              </div>
              {thread}
            </div>
          )}
        </div>

        {open && layout === 'column' && (
          <section aria-label="Side question" onKeyDown={closeOnEscape(close)} className="flex w-80 shrink-0 flex-col border-l border-border bg-card">
            <div className="flex h-10 items-center justify-between pl-3 pr-1.5">
              <span className="text-caption font-semibold text-foreground">Side question</span>
              <CloseButton onClose={close} />
            </div>
            {thread}
          </section>
        )}

        <aside className="flex w-72 shrink-0 flex-col border-l border-border">
          {layout === 'panel' ? (
            <>
              <div className="flex h-10 items-center px-2">
                <TabsSubtle idPrefix="side-chat-panel" size="compact" selectedIndex={panelTab} onSelect={(i) => { setPanelTab(i); if (i === 1) setOpen(true); }}>
                  <TabsSubtleItem index={0} label="Annotations" />
                  <TabsSubtleItem index={1} label="Side chat" />
                </TabsSubtle>
              </div>
              {panelTab === 1 ? (
                <div onKeyDown={closeOnEscape(close)} className="flex min-h-0 flex-1 flex-col">{thread}</div>
              ) : (
                <NoAnnotations />
              )}
            </>
          ) : (
            <>
              <div className="flex h-10 items-center px-3 text-caption font-semibold text-foreground">Annotations</div>
              <NoAnnotations />
            </>
          )}
        </aside>
      </div>
    </div>
  );
};

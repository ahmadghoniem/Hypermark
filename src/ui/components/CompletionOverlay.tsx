import { CLOSE_DELAY_SECONDS, useAutoClose } from '../hooks/useAutoClose';

import { Check, MessageDotsCircle } from '@untitledui/icons';
// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const CheckIcon = () => (
  <Check className="size-8" strokeWidth={2.5} />
);

const ChatBubbleIcon = () => (
  <MessageDotsCircle className="size-8" strokeWidth={2.5} />
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CompletionOverlayProps {
  submitted: 'all-good' | 'feedback-sent' | 'exited' | null | false;
  title: string;
  subtitle: string;
  agentLabel: string;
}

export function CompletionOverlay({ submitted, title, subtitle, agentLabel }: CompletionOverlayProps) {
  const { state } = useAutoClose(!!submitted);

  if (!submitted) return null;

  const isAllGood = submitted === 'all-good';
  const secondsLeft = state.phase === 'closing' ? state.secondsLeft : CLOSE_DELAY_SECONDS;

  return (
    <div className="fixed inset-0 z-popover bg-background flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-8">
        <div
          className={`mx-auto size-16 rounded-full flex items-center justify-center ${
            isAllGood ? 'bg-success/20 text-success' : 'bg-accent/20 text-accent'
          }`}
        >
          {isAllGood ? <CheckIcon /> : <ChatBubbleIcon />}
        </div>

        <div className="space-y-2">
          <h2 className="text-title font-semibold text-foreground">{title}</h2>
          <p className="text-body text-muted-foreground">{subtitle}</p>
        </div>

        {/* The tab counts down and closes itself after the submission lands,
            unless the browser refuses to close a tab it did not open. */}
        <div className="pt-4 border-t border-border space-y-2">
          {state.phase === 'closeFailed' ? (
            <>
              <p className="text-body text-muted-foreground">
                Could not close this tab automatically. Please close it manually.
              </p>
              <p className="text-caption text-muted-foreground/60">
                Auto-close works when the tab is opened by {agentLabel}.
              </p>
            </>
          ) : (
            <>
              <p className="text-body text-muted-foreground">
                Your response has been sent to <span className="text-foreground font-semibold">{agentLabel}</span>.
              </p>
              <p className="text-caption text-muted-foreground/60 tabular-nums" aria-live="polite">
                {secondsLeft > 0
                  ? `This tab closes in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}.`
                  : 'Closing this tab…'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

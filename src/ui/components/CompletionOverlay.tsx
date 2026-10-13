import { useAutoClose } from '../hooks/useAutoClose';

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
  submitted: 'approved' | 'denied' | 'feedback' | 'exited' | null | false;
  title: string;
  subtitle: string;
  agentLabel: string;
}

export function CompletionOverlay({ submitted, title, subtitle, agentLabel }: CompletionOverlayProps) {
  const { state } = useAutoClose(!!submitted);

  if (!submitted) return null;

  const isApproved = submitted === 'approved';

  return (
    <div className="fixed inset-0 z-popover bg-background flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-8">
        <div
          className={`mx-auto size-16 rounded-full flex items-center justify-center ${
            isApproved ? 'bg-success/20 text-success' : 'bg-accent/20 text-accent'
          }`}
        >
          {isApproved ? <CheckIcon /> : <ChatBubbleIcon />}
        </div>

        <div className="space-y-2">
          <h2 className="text-title font-semibold text-foreground">{title}</h2>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>

        {/* The tab closes itself three seconds after the submission lands,
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
              <p className="text-caption text-muted-foreground/60">This tab closes in 3 seconds.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

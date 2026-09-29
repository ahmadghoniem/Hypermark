import { useAutoClose } from '../hooks/useAutoClose';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const CheckIcon = () => (
  <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ChatBubbleIcon = () => (
  <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
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
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>

        {/* The tab closes itself the moment the submission lands, so this
            panel is normally on screen for a frame or two. It has something to
            say only when the browser refuses to close a tab it did not open. */}
        <div className="pt-4 border-t border-border space-y-2">
          {state.phase === 'closeFailed' ? (
            <>
              <p className="text-sm text-muted-foreground">
                Could not close this tab automatically. Please close it manually.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Auto-close works when the tab is opened by {agentLabel}.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You can close this tab and return to <span className="text-foreground font-medium">{agentLabel}</span>.
              </p>
              <p className="text-xs text-muted-foreground/60">Your response has been sent.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

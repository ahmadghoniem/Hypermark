import React, { useState } from 'react';
import { MessageRail, type PickerMessage } from '@/ui/components/MessageRail';
import { RAIL_LONG_ONLY as LONG_ONLY, RAIL_MESSAGES as MESSAGES } from './canvasData';

/** One rail in a frame the size of the document's right edge, with its own state. */
const RailFrame: React.FC<{
  title: string;
  note: string;
  messages: PickerMessage[];
  selected: string;
  showShort?: boolean;
}> = ({ title, note, messages, selected, showShort: initialShowShort = false }) => {
  const [selectedId, setSelectedId] = useState(selected);
  const [showShort, setShowShort] = useState(initialShowShort);
  return (
    <div className="rounded-lg border border-dashed border-border p-5">
      <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <p className="mb-3 text-caption text-muted-foreground">{note}</p>
      <div className="flex h-56 items-center justify-end">
        <MessageRail
          messages={messages}
          selectedMessageId={selectedId}
          onSelect={setSelectedId}
          showShort={showShort}
          onShowShortChange={setShowShort}
        />
      </div>
    </div>
  );
};

/** The rail's short-message eye in its three states. */
export const RailDemo: React.FC = () => (
  <div className="grid grid-cols-3 gap-6">
    <RailFrame
      title="Shown"
      note="The short messages are back as dimmed ticks."
      messages={MESSAGES}
      selected="m2"
      showShort
    />
    <RailFrame
      title="Open message is short"
      note="Approved. is open, so it stays while the rest are hidden. Open another message and it goes."
      messages={MESSAGES}
      selected="m5"
    />
    <RailFrame
      title="No short messages"
      note="Nothing to hide, so there is no icon."
      messages={LONG_ONLY}
      selected="m2"
    />
  </div>
);

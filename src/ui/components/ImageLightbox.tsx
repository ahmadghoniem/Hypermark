import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XClose } from '@untitledui/icons';

/**
 * Full-size image over a dark backdrop, portaled to the body. The close
 * button, a backdrop click or Escape closes it. Escape is caught on the capture phase so an open composer
 * underneath keeps its text, and `data-popover-layer` keeps the composer's
 * click-outside from treating the backdrop as a dismissal.
 */
export const ImageLightbox: React.FC<{ src: string; alt: string; onClose: () => void }> = ({ src, alt, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div
      data-popover-layer
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image preview'}
      className="fixed inset-0 z-overlay flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        // React bubbles portal events to the owner, e.g. a panel card that would select itself
        e.stopPropagation();
        onClose();
      }}
    >
      <button
        type="button"
        aria-label="Close preview"
        autoFocus
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        // eslint-disable-next-line better-tailwindcss/no-restricted-classes -- the button sits on the black lightbox scrim in both modes
        className="absolute top-4 right-4 grid size-9 cursor-pointer place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
      >
        <XClose size={20} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      {alt && (
        // eslint-disable-next-line better-tailwindcss/no-restricted-classes -- caption sits on the black lightbox scrim in both modes
        <div className="mt-3 text-body text-white/70 max-w-[90vw] text-center truncate">{alt}</div>
      )}
    </div>,
    document.body,
  );
};

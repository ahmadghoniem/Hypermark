import React, { useState, useRef } from 'react';
import { getImageSrc } from './ImageThumbnail';
import type { ImageAttachment } from '../types';
import { getUploadTransport } from '../utils/upload';
import { deriveImageName } from '../utils/imageNames';

export { deriveImageName };

interface AttachmentsButtonProps {
  images: ImageAttachment[];
  onAdd: (image: ImageAttachment) => void;
  onRemove: (path: string) => void;
  variant?: 'toolbar' | 'inline';
  /** Hide the "Images" label (icon-only). When images.length > 0 the
   *  numeric badge still shows so the user can see the count. */
  hideLabel?: boolean;
}

/**
 * The composer's attach action: one button that opens the OS file picker.
 *
 * Deliberately not a popover. Everything the old popover offered has a better
 * home already — dropping an image is handled by the composer's own drop
 * target, pasting by the global paste handler, and the attached images are
 * listed by the AttachmentStrip directly under the textarea. What was left was
 * a second drop zone and a browse link wrapped around the picker this button
 * now opens in one click.
 */
export const AttachmentsButton: React.FC<AttachmentsButtonProps> = ({
  images,
  onAdd,
  onRemove,
  variant = 'toolbar',
  hideLabel = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    const name = deriveImageName(file.name, images.map(i => i.name));
    setUploading(true);
    try {
      const data = await getUploadTransport().upload(file);
      if (data.path) onAdd({ path: data.path, name });
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFileSelect(file);
    e.target.value = ''; // Reset for re-selection
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    images.forEach(img => onRemove(img.path));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        aria-label="Attach an image"
        title="Attach an image"
        className="group relative flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        {/* Show stacked thumbnails if we have images */}
        {images.length > 0 ? (
          <>
            <div className="relative flex items-center">
              {images.slice(0, 3).map((img, idx) => (
                <div
                  key={img.path}
                  className="relative size-5 rounded-sm border border-background"
                  style={{ marginLeft: idx > 0 ? '-6px' : 0, zIndex: 3 - idx }}
                >
                  <img
                    src={getImageSrc(img.path)}
                    alt={img.name}
                    loading="lazy"
                    className="size-5 rounded-sm object-cover"
                  />
                </div>
              ))}
              {images.length > 3 && (
                <div
                  className="relative size-5 rounded-sm bg-muted border border-background flex items-center justify-center text-[9px] font-medium"
                  style={{ marginLeft: '-6px', zIndex: 0 }}
                >
                  +{images.length - 3}
                </div>
              )}
            </div>
            {/* Clear all button on hover */}
            <button
              onClick={handleClearAll}
              className="absolute -top-1 -right-1 size-3.5 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <svg className="size-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : uploading ? (
          <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : (
          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        )}
        {(!hideLabel || images.length > 0) && (
          <span className={variant === 'inline' ? 'sr-only' : ''}>
            {images.length > 0 ? `${images.length}` : 'Images'}
          </span>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </>
  );
};

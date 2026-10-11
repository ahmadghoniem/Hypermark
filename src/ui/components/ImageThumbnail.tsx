import React, { useState } from 'react';

import { Image01, XClose } from '@untitledui/icons';
/**
 * Get the display URL for an image path or URL.
 * Remote URLs pass through; local paths resolve through `/api/image`.
 */
export const getImageSrc = (path: string, base?: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path; // Remote URL, use directly
  }
  let url = `/api/image?path=${encodeURIComponent(path)}`;
  if (base && !path.startsWith('/')) {
    url += `&base=${encodeURIComponent(base)}`;
  }
  return url;
};

interface ImageThumbnailProps {
  path: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  onRemove?: () => void;
  showRemove?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'w-6 h-6',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
};

export const ImageThumbnail: React.FC<ImageThumbnailProps> = ({
  path,
  size = 'md',
  onClick,
  onRemove,
  showRemove = true,
  className = '',
}) => {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const sizeClass = SIZES[size];

  return (
    <div className={`group relative ${sizeClass} ${className}`}>
      {loading && !error && (
        <div className={`absolute inset-0 bg-muted rounded-sm animate-pulse`} />
      )}

      {error ? (
        <div
          className={`${sizeClass} rounded-sm bg-muted flex items-center justify-center text-muted-foreground`}
        >
          <Image01 className="size-4" />
        </div>
      ) : (
        <img
          src={getImageSrc(path)}
          alt="Attachment"
          loading="lazy"
          onClick={onClick}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
          className={`${sizeClass} rounded-sm object-cover border border-border ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
        />
      )}

      {/* Remove button */}
      {showRemove && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-1 -right-1 size-4 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <XClose className="size-2.5" strokeWidth={3} />
        </button>
      )}
    </div>
  );
};

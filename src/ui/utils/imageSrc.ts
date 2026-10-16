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

/**
 * Derive a clean, human-readable name from an original filename.
 * "Login Mockup.png" → "login-mockup"
 * "annotated.png" or generic names → "image-N"
 *
 * Extracted from AttachmentsButton so the non-component upload paths (composer
 * paste/drop, spec 05 §3.2) can name attachments identically without importing
 * a React component module. `AttachmentsButton` re-exports it unchanged.
 */
export function deriveImageName(originalName: string, existingNames: string[]): string {
  const base = originalName.replace(/\.[^.]+$/, '');
  const generic = ['annotated', 'image', 'screenshot', 'paste', 'clipboard', 'untitled'];

  if (generic.includes(base.toLowerCase())) {
    let n = 1;
    while (existingNames.includes(`image-${n}`)) n++;
    return `image-${n}`;
  }

  let name = base.toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!name) {
    let n = 1;
    while (existingNames.includes(`image-${n}`)) n++;
    return `image-${n}`;
  }

  if (existingNames.includes(name)) {
    let n = 2;
    while (existingNames.includes(`${name}-${n}`)) n++;
    name = `${name}-${n}`;
  }

  return name;
}

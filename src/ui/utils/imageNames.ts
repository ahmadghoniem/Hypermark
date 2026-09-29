/**
 * Derive a clean, human-readable name from an original filename.
 * "Login Mockup.png" → "login-mockup"
 * "annotated.png" or generic names → "image-N"
 *
 * Shared by the upload paths (composer paste/drop) so every attachment is
 * named the same way.
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

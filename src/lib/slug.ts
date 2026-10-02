import slugifyLib from 'slugify';

export function slugify(value: string): string {
  return slugifyLib(value, { lower: true, strict: true, trim: true }) || 'item';
}

/**
 * Returns `base` or `base-2`, `base-3`... whichever is not taken.
 * `exists` should ignore the record being updated.
 */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  for (let i = 2; await exists(candidate); i++) {
    candidate = `${root}-${i}`;
  }
  return candidate;
}

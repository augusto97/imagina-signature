/**
 * Small, synchronous, non-cryptographic content hash (FNV-1a 32-bit + a murmur-style mix
 * lane → 16 hex chars).
 *
 * Used to remember WHICH inputs a hosted asset (QR PNG, vCard file) was
 * generated from, so the compiler can tell — without a canvas or a
 * network call — whether the uploaded file is still up to date, and the
 * editor can skip re-uploading identical content.
 */
export function contentHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

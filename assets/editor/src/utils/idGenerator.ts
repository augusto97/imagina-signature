/**
 * Generates a short, unique-enough block ID. Collisions are
 * astronomically unlikely within a single signature (~6 bytes of
 * randomness) which is the only scope IDs need to be unique in.
 */
export function generateId(prefix = 'b'): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short random id (10 chars of base36) for channels, patterns, notes, clips and tracks. */
export function createId(): string {
  let id = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(10))) {
    id += ALPHABET.charAt(byte % ALPHABET.length);
  }
  return id;
}

// Kept apart from auth.ts, which needs Next's request context, so the CLIs
// can create ids (email.ts) without pulling Next in.
import { randomBytes } from "crypto";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

// Drop-in replacement for Lucia's `generateId`: a random lowercase
// alphanumeric string of the given length.
export function generateId(length: number): string {
  const bytes = randomBytes(length);
  let id = "";
  for (let i = 0; i < length; i++) {
    id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return id;
}

import { createHash, randomBytes } from "node:crypto";

export interface Pkce {
  verifier: string;
  challenge: string;
  state: string;
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/** RFC 7636 S256: a 64-character verifier, its SHA-256 challenge, and a random `state`. */
export function createPkce(): Pkce {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: base64url(randomBytes(24)) };
}

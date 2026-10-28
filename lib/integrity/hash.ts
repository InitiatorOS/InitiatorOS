/**
 * Isomorphic hashing primitives for the integrity core.
 *
 * Uses Web Crypto (`crypto.subtle`), which is a global in both modern browsers
 * and Node >= 20, so nothing here is tied to a particular runtime. The trace
 * chain and the representation checksum both route through `sha256Hex`.
 */

/** The prevHash of the genesis (first) event — 64 zero nibbles = SHA-256 width. */
export const GENESIS = "0".repeat(64)

/**
 * Canonical, stable-key-order JSON. Two structurally equal values always
 * serialize to the same string regardless of key insertion order, so a hash of
 * the output is a hash of the *content*, not of an accidental ordering.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`
}

/** SHA-256 of a string, returned as lowercase hex. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

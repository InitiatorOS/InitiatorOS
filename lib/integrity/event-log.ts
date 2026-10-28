/**
 * The immutable, append-only trace.
 *
 * Every event's `hash` is SHA-256 over its own content *and* the previous
 * event's hash. That makes the log tamper-evident: changing any field of any
 * past event (or reordering, inserting, or deleting one) breaks the chain from
 * that point forward, and `verifyChain` finds the exact break.
 */
import type { EventType, RawEvent } from "./types.ts"
import { GENESIS, canonicalize, sha256Hex } from "./hash.ts"

/** The content that an event's hash commits to (everything except the hash itself). */
function digestInput(e: Omit<RawEvent, "hash">): string {
  return canonicalize({ seq: e.seq, ts: e.ts, type: e.type, data: e.data, prevHash: e.prevHash })
}

/** Compute the hash an event must carry given its content and prevHash. */
export async function hashEvent(e: Omit<RawEvent, "hash">): Promise<string> {
  return sha256Hex(digestInput(e))
}

/**
 * Append a new event to the trace, returning the new `RawEvent`.
 *
 * Pure with respect to the input `log` — it does not mutate it; callers hold the
 * new array (`[...log, event]`). `seq` is monotonic and `prevHash` binds to the
 * current tail (or GENESIS for the first event).
 */
export async function appendEvent(
  log: readonly RawEvent[],
  type: EventType,
  data: Record<string, number | string>,
): Promise<RawEvent> {
  const prev = log[log.length - 1]
  const seq = prev ? prev.seq + 1 : 0
  const prevHash = prev ? prev.hash : GENESIS
  const ts = Date.now()
  const hash = await hashEvent({ seq, ts, type, data, prevHash })
  return { seq, ts, type, data, prevHash, hash }
}

/**
 * Walk the chain and verify every link. Returns the index of the first broken
 * event, or `null` when the whole chain is contiguous and self-consistent.
 */
export async function verifyChain(
  log: readonly RawEvent[],
): Promise<{ valid: boolean; brokenAt: number | null }> {
  let prevHash = GENESIS
  for (let i = 0; i < log.length; i++) {
    const e = log[i]
    if (e.prevHash !== prevHash) return { valid: false, brokenAt: i }
    const expected = await hashEvent({ seq: e.seq, ts: e.ts, type: e.type, data: e.data, prevHash: e.prevHash })
    if (expected !== e.hash) return { valid: false, brokenAt: i }
    prevHash = e.hash
  }
  return { valid: true, brokenAt: null }
}

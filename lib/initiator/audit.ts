/**
 * The audit log — every Initiator function, logged and clocked.
 *
 * The event trace records user/world telemetry. This records the *OS's own
 * functions*: each operation the Initiator performs is stamped with a monotonic
 * logical clock (`tick`), its wall-clock start and measured duration, whether it
 * completed, and a digest of the post-state — then hash-chained like the trace.
 *
 * Because the Initiator is the sole entry point and routes every operation
 * through this log, there is no middleman: no function reaches the interface
 * without a clocked, chained record. `verify()` checks both the hash chain and
 * that the ticks are contiguous (1, 2, 3, …) — a missing tick would mean an
 * operation bypassed the audit, which the single dispatch path makes impossible.
 * That gap-proof, tamper-evident record is what makes a zero-trust audit safe.
 */
import { GENESIS, canonicalize, sha256Hex } from "../integrity/hash.ts"

export interface AuditEntry {
  fn: string
  startedAt: number
  durationMs: number
  ok: boolean
  digest: string
}

export interface AuditRecord extends AuditEntry {
  tick: number
  prevHash: string
  hash: string
}

export class AuditLog {
  private readonly records: AuditRecord[] = []
  private tickCounter = 0

  /** The current clock value — the tick of the most recent recorded function. */
  get tick(): number {
    return this.tickCounter
  }

  async record(entry: AuditEntry): Promise<AuditRecord> {
    const tick = ++this.tickCounter
    const prev = this.records[this.records.length - 1]
    const prevHash = prev ? prev.hash : GENESIS
    const content = {
      tick,
      fn: entry.fn,
      startedAt: entry.startedAt,
      durationMs: entry.durationMs,
      ok: entry.ok,
      digest: entry.digest,
      prevHash,
    }
    const hash = await sha256Hex(canonicalize(content))
    const rec: AuditRecord = { ...content, hash }
    this.records.push(rec)
    return rec
  }

  entries(): readonly AuditRecord[] {
    return this.records
  }

  /** Verify the chain and that the clock is gap-free (ticks 1..n, in order). */
  async verify(): Promise<{ valid: boolean; brokenAt: number | null }> {
    let prevHash = GENESIS
    for (let i = 0; i < this.records.length; i++) {
      const r = this.records[i]
      if (r.prevHash !== prevHash || r.tick !== i + 1) return { valid: false, brokenAt: i }
      const content = {
        tick: r.tick,
        fn: r.fn,
        startedAt: r.startedAt,
        durationMs: r.durationMs,
        ok: r.ok,
        digest: r.digest,
        prevHash: r.prevHash,
      }
      const expected = await sha256Hex(canonicalize(content))
      if (expected !== r.hash) return { valid: false, brokenAt: i }
      prevHash = r.hash
    }
    return { valid: true, brokenAt: null }
  }
}

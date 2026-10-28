/**
 * KERNEL — the Twins. Dual backend verification actors.
 *
 * Twin-1 (prediction) takes the representation an upper layer *claims* is true.
 * Twin-2 (truth-bound) recomputes the representation strictly from the trace and
 * will not invent a field it cannot derive. Execution is permitted only when the
 * two outputs are identical — the parity constraint O₁ = O₂.
 *
 * Here that is exactly the reconciler's two sides: the claimed representation vs.
 * the deterministic fold of the trace. Parity holds iff they reconcile, so the
 * Twins are the kernel-level framing of the same ground-truth check.
 */
import type { Divergence, RawEvent, Representation } from "../integrity/types.ts"
import { reconcile } from "../integrity/reconciler.ts"

export interface TwinsResult {
  /** O₁ = O₂: the claimed representation matches the trace-derived one. */
  parity: boolean
  /** Twin-1 (prediction): checksum of the claimed/live representation. */
  o1Checksum: string
  /** Twin-2 (truth-bound): checksum recomputed strictly from the trace. */
  o2Checksum: string
  divergences: Divergence[]
}

export async function twins(claimed: Representation, log: readonly RawEvent[]): Promise<TwinsResult> {
  const r = await reconcile(claimed, log)
  return { parity: r.ok, o1Checksum: r.liveChecksum, o2Checksum: r.expectedChecksum, divergences: r.diffs }
}

/**
 * The reconciler: the algorithmic state-comparison engine.
 *
 * It takes the *live* representation (whatever an upper layer currently claims
 * is true) and the raw trace, re-derives the representation the trace actually
 * implies, and reports every field where the two disagree. It also re-verifies
 * the hash chain, so corruption of the trace itself surfaces as a divergence.
 *
 * This is the software-level realization of the "representation must answer to
 * the trace" rule: an abstraction that drifts from what was physically recorded
 * is caught here before it is trusted.
 */
import type { Divergence, RawEvent, ReconcileReport, Representation } from "./types.ts"
import { canonicalize } from "./hash.ts"
import { checksumOf, project } from "./projection.ts"
import { verifyChain } from "./event-log.ts"

const fmt = (v: unknown): string => (typeof v === "string" ? v : canonicalize(v))

export async function reconcile(live: Representation, log: readonly RawEvent[]): Promise<ReconcileReport> {
  const expected = project(log)
  const diffs: Divergence[] = []

  const scalarKeys = ["keyPresses", "scrolls", "pointerSamples", "pointerDistance"] as const
  for (const key of scalarKeys) {
    if (live[key] !== expected[key]) {
      diffs.push({ field: key, live: fmt(live[key]), expected: fmt(expected[key]), kind: "field" })
    }
  }

  for (const key of ["bounds", "lastPointer"] as const) {
    if (canonicalize(live[key]) !== canonicalize(expected[key])) {
      diffs.push({ field: key, live: fmt(live[key]), expected: fmt(expected[key]), kind: "field" })
    }
  }

  const floorKeys = ["probes", "reachable", "absent", "gated"] as const
  for (const key of floorKeys) {
    if (live.floor[key] !== expected.floor[key]) {
      diffs.push({
        field: `floor.${key}`,
        live: fmt(live.floor[key]),
        expected: fmt(expected.floor[key]),
        note: key === "gated" ? "restriction count ρ disagrees with trace" : "floor map disagrees with trace",
        kind: "field",
      })
    }
  }

  const types = ["pointer", "click", "key", "scroll", "witness"] as const
  for (const t of types) {
    if (live.countsByType[t] !== expected.countsByType[t]) {
      diffs.push({
        field: `countsByType.${t}`,
        live: fmt(live.countsByType[t]),
        expected: fmt(expected.countsByType[t]),
        kind: "field",
      })
    }
  }

  const chain = await verifyChain(log)
  if (!chain.valid) {
    diffs.push({
      field: `chain[@${chain.brokenAt}]`,
      live: "broken",
      expected: "contiguous hash chain",
      note: "tamper-evident chain failed verification",
      kind: "chain-break",
    })
  }

  const liveChecksum = await checksumOf(live)
  const expectedChecksum = await checksumOf(expected)

  return {
    ok: diffs.length === 0 && chain.valid && liveChecksum === expectedChecksum,
    chainValid: chain.valid,
    liveChecksum,
    expectedChecksum,
    diffs,
    eventCount: log.length,
  }
}

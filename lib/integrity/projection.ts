/**
 * The projection: a deterministic fold of the raw trace into a `Representation`.
 *
 * `applyEvent` is a pure reducer — same trace in, same representation out, every
 * time, on any runtime. That determinism is what makes reconciliation possible:
 * the reconciler re-folds the trace and any disagreement with the live
 * representation is necessarily drift, never nondeterminism.
 */
import type { ProbeStatus, RawEvent, Representation } from "./types.ts"
import { canonicalize, sha256Hex } from "./hash.ts"

/** The empty representation — the fold's identity element. */
export function initialRepresentation(): Representation {
  return {
    keyPresses: 0,
    scrolls: 0,
    pointerSamples: 0,
    pointerDistance: 0,
    bounds: null,
    lastPointer: null,
    countsByType: { pointer: 0, click: 0, key: 0, scroll: 0, witness: 0 },
    floor: { probes: 0, reachable: 0, absent: 0, gated: 0 },
  }
}

/** Fold a single event into a representation, returning a fresh copy. */
export function applyEvent(rep: Representation, e: RawEvent): Representation {
  const next: Representation = {
    ...rep,
    countsByType: { ...rep.countsByType },
    floor: { ...rep.floor },
    bounds: rep.bounds ? { ...rep.bounds } : null,
    lastPointer: rep.lastPointer ? { ...rep.lastPointer } : null,
  }

  next.countsByType[e.type] += 1

  if (e.type === "key") next.keyPresses += 1
  if (e.type === "scroll") next.scrolls += 1

  // A floor-probe witness folds into the restriction tally. `gated` is the count
  // of proven boundaries — this is ρ(E_n), accumulated across probes.
  if (e.type === "witness") {
    next.floor.probes += 1
    const status = e.data.status as ProbeStatus
    if (status === "reachable") next.floor.reachable += 1
    else if (status === "absent") next.floor.absent += 1
    else if (status === "gated") next.floor.gated += 1
  }

  if (e.type === "pointer" || e.type === "click") {
    const x = Number(e.data.x ?? 0)
    const y = Number(e.data.y ?? 0)

    if (e.type === "pointer") {
      next.pointerSamples += 1
      if (next.lastPointer) {
        next.pointerDistance += Math.hypot(x - next.lastPointer.x, y - next.lastPointer.y)
      }
      next.lastPointer = { x, y }
    }

    next.bounds = next.bounds
      ? {
          minX: Math.min(next.bounds.minX, x),
          minY: Math.min(next.bounds.minY, y),
          maxX: Math.max(next.bounds.maxX, x),
          maxY: Math.max(next.bounds.maxY, y),
        }
      : { minX: x, minY: y, maxX: x, maxY: y }
  }

  return next
}

/** Fold an entire trace into its representation. */
export function project(log: readonly RawEvent[]): Representation {
  let rep = initialRepresentation()
  for (const e of log) rep = applyEvent(rep, e)
  return rep
}

/** The content checksum of a representation — the single value the gate compares. */
export async function checksumOf(rep: Representation): Promise<string> {
  return sha256Hex(canonicalize(rep))
}

/**
 * ISF_004 — Multi-Order Causal Impact and Feedback Tracing Engine.
 *
 * Traces downstream structural consequences through load-bearing pillars to
 * find root-level liability rather than the surface symptom, ignoring
 * horizontal proxy noise.
 */
import type { AuditGap, Isf004Out, Pillar } from "./types.ts"

export const ISF_004 = {
  id: "ISF_004",
  designation: "Multi-Order Causal Impact and Feedback Tracing Engine",
} as const

/** Load-bearing weight of each pillar in this architecture — a declared model, not a measurement. */
export const PILLAR_WEIGHT: Record<Pillar, number> = { VOLTAGE: 1, MACHINE: 3, CODE: 3, INTERFACE: 2, AUDIT: 3 }

/**
 * Trace how much of the structure rests on the gap. Strain is the summed weight
 * of every pillar it touches, scaled by severity. A gap resting on at most one
 * pillar is horizontal — bounded, not structural — and is never mistaken for a
 * single-variable explanation of a multi-pillar failure.
 */
export function trace(gap: AuditGap): Isf004Out {
  const load = gap.pillars.reduce((sum, p) => sum + PILLAR_WEIGHT[p], 0)
  const strainIndex = Number((load * gap.severity).toFixed(2))
  return { nodeId: "ISF_004", strainIndex, pillars: gap.pillars, horizontal: gap.pillars.length <= 1 }
}

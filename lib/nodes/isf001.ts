/**
 * ISF_001 — Topological Constraint and Invariant Verification Engine.
 *
 * Enforces hard boundaries with state invariants rather than mutable software
 * proxy checks, collapsing illegal state before execution.
 */
import type { AuditGap, Isf001Out, Isf003Out } from "./types.ts"

export const ISF_001 = {
  id: "ISF_001",
  designation: "Topological Constraint and Invariant Verification Engine",
} as const

/** Evidence this engine refuses to count: proxies, not physical verification. */
export const PROXIES_REJECTED = ["tests-passed", "documentation-asserts", "author-attestation"] as const

/**
 * Collapse the gap to a binary authorization flag and an entropy delta. A thing
 * may be relied on only if it is observable AND bound by an invariant; a gap
 * failing either is not authorized, whatever proxy evidence says otherwise.
 * Entropy is the fraction of boundary variables absent — the uncertainty the
 * gap injects into anything built on it.
 */
export function constrain(gap: AuditGap, semantic: Isf003Out): Isf001Out {
  const values = Object.values(semantic.matrix)
  const absent = values.filter((v) => v === "absent").length
  const entropyDelta = Number((absent / values.length).toFixed(2))
  const authorized = semantic.boundary.observed === "present" && semantic.boundary.invariant === "present"
  return {
    nodeId: "ISF_001",
    authorized,
    entropyDelta,
    invariant: gap.invariant,
    proxyRejected: [...PROXIES_REJECTED],
  }
}

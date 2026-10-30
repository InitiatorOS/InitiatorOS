/**
 * ISF_005 — Recursive Metacognitive Boundary Audit Loop.
 *
 * Audits the accounting itself. It refuses vocabulary substitution: a gap that
 * names no observable is words, not a variable, and the loop is interrupted; a
 * gap anchored only to provenance cannot be closed by any relabel and is sent
 * back to its minimum requirement. Only physical anchoring proceeds.
 */
import type { AuditGap, Isf001Out, Isf003Out, Isf005Out } from "./types.ts"

export const ISF_005 = {
  id: "ISF_005",
  designation: "Recursive Metacognitive Boundary Audit Loop",
} as const

export function reflect(gap: AuditGap, semantic: Isf003Out, constraint: Isf001Out): Isf005Out {
  if (gap.anchor === null) {
    return {
      nodeId: "ISF_005",
      anchored: false,
      loopDetected: true,
      signal: "interrupt",
      reason: `'${gap.id}' names no observable — vocabulary, not a variable; accounting rejected`,
    }
  }
  if (gap.anchor.kind === "provenance") {
    return {
      nodeId: "ISF_005",
      anchored: false,
      loopDetected: false,
      signal: "recalibrate",
      reason: `'${gap.id}' is anchored only to provenance (${gap.anchor.ref}); no relabel closes it — requires: ${gap.requirement}`,
    }
  }
  return {
    nodeId: "ISF_005",
    anchored: true,
    loopDetected: false,
    signal: "proceed",
    reason: `'${gap.id}' anchored to ${gap.anchor.kind}:${gap.anchor.ref}; entropy ${constraint.entropyDelta} over ${semantic.detokenized.length} typed variables`,
  }
}

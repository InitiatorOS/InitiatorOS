/**
 * The node layer (ISF_001–005, the first subset) — contracts.
 *
 * Its job is to account for what the system cannot properly audit. An audit gap
 * is never merely listed; it is a declared variable (`AuditGap`) run through the
 * five engines. Each node's own input vector is declared too, and a node reports
 * which of its inputs are actually present in this substrate — the layer applies
 * the define-the-variable rule to itself.
 */
import type { Rung } from "../integrity/layers.ts"
import type { Representation } from "../integrity/types.ts"
import type { SlotStatus } from "../modules/slot.ts"
import type { AuditRecord } from "../initiator/audit.ts"

export type Presence = "present" | "absent"

/**
 * ISF_003's output: the five mechanical variables the word "audit" decomposes
 * into. No adjective survives — only these, each present or absent.
 */
export interface BoundaryState {
  /** Is the thing itself observable in this substrate? */
  observed: Presence
  /** Does something other than the claim actually read it? */
  observer: Presence
  /** Is there a hard condition it must satisfy? */
  invariant: Presence
  /** Does the record survive the process? */
  persistence: Presence
  /** Is the verifier independent of the author? */
  independence: Presence
}

export type AnchorKind = "slot" | "field" | "audit" | "provenance"

/** The observable a gap is anchored to. `provenance` is not a physical anchor. */
export interface Anchor {
  kind: AnchorKind
  ref: string
}

/** A load-bearing pillar of the architecture. */
export type Pillar = Rung | "AUDIT"

/** A declared variable representation of something the system cannot properly audit. */
export interface AuditGap {
  id: string
  statement: string
  anchor: Anchor | null
  boundary: BoundaryState
  invariant: string
  pillars: Pillar[]
  /** 0..1 — how much of each pillar's load this gap carries. */
  severity: number
  /** The minimum change that would close the gap. */
  requirement: string
}

/** An ISF_002 correction: hard isolation issued without a human in the loop. */
export interface IsolationCommand {
  kind: "isolate-source" | "isolate-function"
  target: string
  reason: string
  /** Whether the Initiator actually enforced it (vs. recorded it). */
  applied: boolean
  at: number
}

/** Live state the node layer reads. */
export interface NodeContext {
  modules: SlotStatus[]
  rep: Representation
  audit: readonly AuditRecord[]
  isolations: readonly IsolationCommand[]
  auditPersisted: boolean
}

export interface Isf001Out {
  nodeId: "ISF_001"
  /** May the system rely on this unverified thing for authorization? */
  authorized: boolean
  /** Fraction of boundary variables absent — the uncertainty the gap introduces. */
  entropyDelta: number
  invariant: string
  /** Evidence the engine refuses to count — proxies, not physical verification. */
  proxyRejected: string[]
}

export interface Isf002Out {
  nodeId: "ISF_002"
  telemetry: { present: string[]; absent: string[] }
  baselineMs: number
  latestMs: number
  deviation: number
  anomaly: boolean
  commands: IsolationCommand[]
}

export interface Isf003Out {
  nodeId: "ISF_003"
  boundary: BoundaryState
  matrix: Record<string, Presence>
  /** The gap as bare `variable=presence` terms — no prose. */
  detokenized: string[]
}

export interface Isf004Out {
  nodeId: "ISF_004"
  strainIndex: number
  pillars: Pillar[]
  /** A gap resting on at most one pillar: bounded, not structural. */
  horizontal: boolean
}

export type MetaSignal = "proceed" | "recalibrate" | "interrupt"

export interface Isf005Out {
  nodeId: "ISF_005"
  anchored: boolean
  loopDetected: boolean
  signal: MetaSignal
  reason: string
}

export interface GapAccount {
  gap: AuditGap
  semantic: Isf003Out
  constraint: Isf001Out
  strain: Isf004Out
  meta: Isf005Out
}

export interface Accounting {
  gaps: GapAccount[]
  /** System-level: ISF_002 is a circuit over the whole runtime, not a per-gap classifier. */
  correction: Isf002Out
  totalEntropy: number
  authorizedCount: number
  /** Gap ids by strain, highest first — close the top one for the most effect. */
  chokePoints: string[]
  signal: MetaSignal
  /** False when ISF_005 interrupted: the accounting itself failed its own audit. */
  valid: boolean
}

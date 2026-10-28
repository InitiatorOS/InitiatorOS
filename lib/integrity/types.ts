/**
 * Shared types for the integrity core.
 *
 * The core idea: a physical *trace* (immutable, hash-chained `RawEvent`s) is the
 * only ground truth. Everything a user or an upper layer sees is a
 * `Representation` — a deterministic fold of that trace. The `reconcile` pass
 * proves the two agree; any disagreement is drift or tampering.
 */

/**
 * The kinds of state transition the core understands.
 *
 * `pointer | click | key | scroll` are interaction telemetry. `witness` is a
 * floor-probe result folded into the *same* chain, so a restriction boundary is
 * recorded with the same tamper-evidence as everything else.
 */
export type EventType = "pointer" | "click" | "key" | "scroll" | "witness"

/**
 * A single link in the immutable physical trace.
 *
 * `hash` is derived from the event's own content plus `prevHash`, which chains
 * every event to the one before it (tamper-evident). `data` admits strings so a
 * floor-probe witness (handle name, denial code) chains into the exact same
 * trace as raw interaction telemetry.
 */
export interface RawEvent {
  seq: number
  ts: number
  type: EventType
  data: Record<string, number | string>
  prevHash: string
  hash: string
}

/**
 * The three-way classification of a floor probe.
 * - `reachable`: the handle returned a value         (state is inside the floor)
 * - `absent`:    no handle exists at all (ENOENT)    (the floor is merely finite here)
 * - `gated`:     handle exists but returned a typed denial, e.g.
 *                SecurityError / 'denied'            (an operator actively occludes
 *                                                     the state — a RESTRICTION)
 *
 * Only `gated` is a restriction. The distinction between finitude (`absent`) and
 * active occlusion (`gated`) is the whole point: a gated probe is a reachable
 * artifact that references an unreachable state — a proof of the boundary from
 * inside the floor, obtained without ever reading the occluded value.
 */
export type ProbeStatus = "reachable" | "absent" | "gated"

/**
 * A restriction witness W(s) = <handle, typed-denial>.
 * `detail` carries the returned-value summary (reachable), the reason a handle
 * is missing (absent), or the typed denial code (gated).
 */
export interface WitnessRecord {
  handle: string
  label: string
  status: ProbeStatus
  detail: string
}

/**
 * The derived representation: a deterministic fold of the raw trace. This is the
 * "readable" side that must always reconcile against the log.
 */
export interface Representation {
  keyPresses: number
  scrolls: number
  pointerSamples: number
  pointerDistance: number
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
  lastPointer: { x: number; y: number } | null
  countsByType: Record<EventType, number>
  /**
   * Floor-restriction tally derived from witness events in the trace. `gated` is
   * ρ(E_n): the count of proven boundaries. This folds into the checksum, so
   * drift or corruption of the restriction map is caught too.
   */
  floor: { probes: number; reachable: number; absent: number; gated: number }
}

/** How a single reconciliation difference arose. */
export type DivergenceKind = "field" | "chain-break" | "length"

/** One disagreement between the live representation and the trace-derived one. */
export interface Divergence {
  field: string
  live: string
  expected: string
  note?: string
  kind: DivergenceKind
}

/**
 * The verdict of a reconciliation pass. `ok` is true only when the hash chain is
 * intact, every field matches, and the two checksums are identical.
 */
export interface ReconcileReport {
  ok: boolean
  chainValid: boolean
  liveChecksum: string
  expectedChecksum: string
  diffs: Divergence[]
  eventCount: number
}

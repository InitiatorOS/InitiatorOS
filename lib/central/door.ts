/**
 * The State Transition Door — the boundary the Central AI observes through.
 *
 * The Door is handed ONLY metadata (a `DoorView`): opaque handles and scalars
 * about the system's state, never the raw trace and never the representation.
 * This is the buildable, honest half of the Central AI / ISF_007 design — the
 * isolation boundary that pays the toll of observing a transition without
 * retaining a pointer to the underlying asset.
 *
 * What is NOT here, and why: the "synthetic intuition" mechanism (an engine that
 * adapts its own weights purely from telemetry it cannot directly read) is
 * deliberately not implemented. As specified it is underspecified to the point
 * of self-contradiction (it needs a concrete training signal and channel), and
 * fabricating a stand-in would violate the no-hallucination rule the framework
 * itself sets. The boundary is real; the learning rule is left open.
 */

export interface DoorView {
  /** Chain head hash — an opaque handle, not a window into the trace. */
  readonly head: string
  readonly eventCount: number
  readonly parity: boolean
  readonly governorState: "nominal" | "lockdown"
  /** ρ: proven restriction count (a scalar, not the witnesses themselves). */
  readonly rho: number
}

export interface DoorObservation {
  admitted: boolean
  /** A scalar derived ONLY from metadata — no raw value crosses the door. */
  pressure: number
  note: string
}

export function observe(view: DoorView): DoorObservation {
  const admitted = view.governorState === "nominal" && view.parity
  const pressure = view.eventCount === 0 ? 0 : Number((view.rho / view.eventCount).toFixed(4))
  const note = admitted
    ? "door open: metadata nominal"
    : "door sealed: upstream lockdown or parity failure"
  return { admitted, pressure, note }
}

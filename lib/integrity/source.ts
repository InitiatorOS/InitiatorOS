/**
 * The substrate seam.
 *
 * The integrity core (trace, projection, reconciler) is substrate-agnostic. It
 * consumes *typed inputs* and classified *witnesses*; it never reaches for a
 * browser, a device, or a kernel directly. Those live behind two interfaces so
 * the "browser location is a variable to be changed" is a real seam, not a
 * figure of speech:
 *
 *   - `EventSource`  yields interaction / state-transition inputs to be chained.
 *   - `FloorProbe`   interrogates a runtime's capability boundary and classifies
 *                    each handle as reachable / absent / gated.
 *
 * The browser floor-probe in `floor-probe.ts` is one `FloorProbe`. A host build
 * supplies a different `FloorProbe` (and `EventSource`) over the same interface
 * — the core above it does not change.
 */
import type { EventType, WitnessRecord } from "./types.ts"

/** A raw input before it is sequenced and hashed into the trace. */
export interface RawInput {
  type: EventType
  data: Record<string, number | string>
}

/** A stream of typed inputs. `start` returns a stop function. */
export interface EventSource {
  readonly name: string
  start(emit: (input: RawInput) => void): () => void
}

/**
 * A capability-boundary interrogator. `run` resolves with one witness per handle
 * and must never throw: hitting a boundary is the probe working correctly, so a
 * denial is returned as a `gated` witness, not raised as an error.
 */
export interface FloorProbe {
  readonly name: string
  run(): Promise<WitnessRecord[]>
}

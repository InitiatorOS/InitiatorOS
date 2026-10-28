/**
 * Trace-building helpers — the substrate-agnostic core of what a UI (or a host
 * event loop) does when it folds inputs and floor-probe witnesses into the same
 * hash chain. Extracted from any particular front end so it can be driven from a
 * browser, a test, or a host runtime identically.
 */
import type { RawEvent, WitnessRecord } from "./types.ts"
import type { RawInput } from "./source.ts"
import { appendEvent } from "./event-log.ts"

/** Append one typed input to the trace, returning the extended log. */
export async function ingestInput(log: readonly RawEvent[], input: RawInput): Promise<RawEvent[]> {
  const event = await appendEvent(log, input.type, input.data)
  return [...log, event]
}

/**
 * Append a batch of floor-probe witnesses to the trace as `witness` events,
 * sharing one `batch` stamp. Record-and-continue: a gated witness is successful
 * boundary mapping, not a failure, so nothing here throws or short-circuits.
 */
export async function ingestWitnesses(
  log: readonly RawEvent[],
  witnesses: readonly WitnessRecord[],
  batch = Date.now(),
): Promise<RawEvent[]> {
  let next = [...log]
  for (const w of witnesses) {
    const event = await appendEvent(next, "witness", {
      handle: w.handle,
      label: w.label,
      status: w.status,
      detail: w.detail,
      batch,
    })
    next = [...next, event]
  }
  return next
}

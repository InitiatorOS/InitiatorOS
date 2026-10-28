/**
 * KERNEL — the Mayor. The pure-telemetry witness.
 *
 * The Mayor is deliberately blinded to representation, UI, and semantics. It
 * reads only trace facts — the hash chain, which is the software stand-in for
 * raw silicon telemetry — plus the Twins' parity *signal* (a single boolean:
 * did the processed output match the physical trace?). It never sees the
 * representation content. Its sole function is to halt the moment a discrepancy
 * appears between processed representation and physical execution.
 *
 * It is a non-actor: it computes no representation and admits nothing. It only
 * reports halt / nominal.
 */
import type { RawEvent } from "../integrity/types.ts"
import { verifyChain } from "../integrity/event-log.ts"
import type { TwinsResult } from "./twins.ts"

export interface MayorVerdict {
  halt: boolean
  reason: string
}

export async function mayor(
  log: readonly RawEvent[],
  twinsSignal: Pick<TwinsResult, "parity">,
): Promise<MayorVerdict> {
  const chain = await verifyChain(log)
  if (!chain.valid) return { halt: true, reason: `chain broken at @${chain.brokenAt}` }
  if (!twinsSignal.parity) {
    return { halt: true, reason: "twins parity failed: representation diverges from the physical trace" }
  }
  return { halt: false, reason: "nominal: representation matches the physical trace" }
}

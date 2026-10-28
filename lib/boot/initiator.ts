/**
 * BOOT — the Initiator boot sequence.
 *
 * The in-runtime software model of the bare-metal root. A real Initiator lives
 * at the hypervisor/silicon root and is a separate host effort (see
 * docs/ARCHITECTURE.md); this is the part of the boot contract that can run in
 * this substrate honestly:
 *
 *   1. load any persisted trace from the configured store,
 *   2. ATTEST it — re-verify the hash chain; a broken prior chain cannot be
 *      sealed, and the kernel that boots on top will lock down,
 *   3. map the floor once at startup (an initial capability probe), sealing the
 *      witnesses into the same chain,
 *   4. report the sealed head.
 *
 * This is the software analog of measured boot. A hardware root of trust is what
 * makes it un-spoofable; that belongs to the host substrate, not here, and the
 * report says `sealed: false` rather than pretending otherwise.
 */
import type { RawEvent, Representation } from "../integrity/types.ts"
import type { FloorProbe } from "../integrity/source.ts"
import type { TraceStore } from "../integrity/persistence.ts"
import { GENESIS } from "../integrity/hash.ts"
import { verifyChain } from "../integrity/event-log.ts"
import { project } from "../integrity/projection.ts"
import { ingestWitnesses } from "../integrity/trace.ts"
import { memoryStore } from "../integrity/persistence.ts"
import { browserFloorProbe } from "../integrity/floor-probe.ts"

export interface BootReport {
  bootedAt: number
  head: string
  chainValid: boolean
  /** A broken prior chain cannot be sealed; the kernel locks down on `false`. */
  sealed: boolean
  eventCount: number
  floor: Representation["floor"]
}

export interface BootResult {
  report: BootReport
  log: RawEvent[]
  store: TraceStore
}

export interface BootOptions {
  store?: TraceStore
  /** The startup floor probe. `null` skips it (deterministic boot for tests). */
  probe?: FloorProbe | null
}

export async function boot(opts: BootOptions = {}): Promise<BootResult> {
  const store = opts.store ?? memoryStore()
  const probe = opts.probe === undefined ? browserFloorProbe : opts.probe

  const loaded = await store.load()
  const chain = await verifyChain(loaded)

  // Only a sealed (valid) chain may be extended. A broken prior chain is left
  // exactly as found so the kernel can quarantine it.
  let log = loaded
  if (chain.valid && probe) {
    const witnesses = await probe.run()
    log = await ingestWitnesses(loaded, witnesses)
    await store.save(log)
  }

  const rep = project(log)
  const report: BootReport = {
    bootedAt: Date.now(),
    head: log.length ? log[log.length - 1].hash : GENESIS,
    chainValid: chain.valid,
    sealed: chain.valid,
    eventCount: log.length,
    floor: rep.floor,
  }
  return { report, log, store }
}

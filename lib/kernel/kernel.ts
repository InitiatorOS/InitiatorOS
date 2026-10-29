/**
 * KERNEL — the supervisory loop that makes this an operating system rather than
 * a library: boot the Initiator, then run every state transition through the
 * Twins → Mayor → Governor hierarchy, exposing only metadata to the Central AI
 * Door and only answering Negotiator queries while the Governor is nominal.
 *
 * Lifecycle: `Kernel.boot()` → `step(input)` / `probeFloor()` per transition →
 * `query(request)` for a formulated answer. A proven discrepancy anywhere trips
 * the Governor and seals the Door and queries until `resetGovernor()`.
 */
import type { RawEvent, Representation } from "../integrity/types.ts"
import type { FloorProbe, RawInput } from "../integrity/source.ts"
import type { TraceStore } from "../integrity/persistence.ts"
import type { NegotiationRequest, NegotiationVerdict } from "../integrity/negotiator.ts"
import { GENESIS } from "../integrity/hash.ts"
import { project } from "../integrity/projection.ts"
import { ingestInput, ingestWitnesses } from "../integrity/trace.ts"
import { negotiate } from "../integrity/negotiator.ts"
import { browserFloorProbe } from "../integrity/floor-probe.ts"
import { boot, type BootReport } from "../boot/initiator.ts"
import { twins, type TwinsResult } from "./twins.ts"
import { mayor, type MayorVerdict } from "./mayor.ts"
import { Governor, type GovernorDecision } from "./governor.ts"
import { observe, type DoorObservation, type DoorView } from "../central/door.ts"
import { ModuleBus, createOsBus } from "../modules/bus.ts"
import type { Actor } from "../modules/actor.ts"
import type { SlotRequirement, SlotStatus } from "../modules/slot.ts"

export interface SupervisoryResult {
  twins: TwinsResult
  mayor: MayorVerdict
  governor: GovernorDecision
  door: DoorObservation
  /** The Central AI module's observation, or null when its slot is unbound. */
  central: { id: string; output: unknown } | null
  /** The currently unbound slots — the self-defined roadblocks, reported live. */
  requirements: SlotRequirement[]
}

export interface KernelState {
  head: string
  eventCount: number
  governor: "nominal" | "lockdown"
  floor: Representation["floor"]
}

/** A query refused because the Governor is in lockdown. */
export interface LockedVerdict {
  sufficient: false
  locked: true
  reasons: string[]
}

export type KernelQueryResult = NegotiationVerdict | LockedVerdict

export class Kernel {
  private log: RawEvent[]
  private readonly store: TraceStore
  private readonly probe: FloorProbe | null
  private readonly governor: Governor
  private readonly bus: ModuleBus
  readonly bootReport: BootReport

  private constructor(
    log: RawEvent[],
    store: TraceStore,
    probe: FloorProbe | null,
    governor: Governor,
    bus: ModuleBus,
    bootReport: BootReport,
  ) {
    this.log = log
    this.store = store
    this.probe = probe
    this.governor = governor
    this.bus = bus
    this.bootReport = bootReport
  }

  static async boot(opts: { store?: TraceStore; probe?: FloorProbe | null; bus?: ModuleBus } = {}): Promise<Kernel> {
    const probe = opts.probe === undefined ? browserFloorProbe : opts.probe
    const { report, log, store } = await boot({ store: opts.store, probe })
    const governor = new Governor()
    // Boot attestation: a broken prior chain locks the kernel down immediately.
    if (!report.sealed) {
      governor.evaluate({ halt: true, reason: "boot attestation failed: prior chain not sealed" })
    }
    // Declare the standard slots (AI actors + silicon substrate), all unbound.
    // The kernel runs with every one of them empty.
    const bus = opts.bus ?? createOsBus()
    return new Kernel(log, store, probe, governor, bus, report)
  }

  get state(): KernelState {
    const rep = project(this.log)
    return {
      head: this.head(),
      eventCount: this.log.length,
      governor: this.governor.state,
      floor: rep.floor,
    }
  }

  private head(): string {
    return this.log.length ? this.log[this.log.length - 1].hash : GENESIS
  }

  /** Admit an input: append it to the trace, then run the supervisory pipeline. */
  async step(input: RawInput): Promise<SupervisoryResult> {
    this.log = await ingestInput(this.log, input)
    await this.store.save(this.log)
    return this.supervise(project(this.log))
  }

  /** Map the floor: run the probe, chain the witnesses in, then supervise. */
  async probeFloor(): Promise<SupervisoryResult> {
    if (this.probe) {
      const witnesses = await this.probe.run()
      this.log = await ingestWitnesses(this.log, witnesses)
      await this.store.save(this.log)
    }
    return this.supervise(project(this.log))
  }

  /**
   * Supervise a *claimed* representation against the trace. Normally the claim is
   * the honest fold (from `step`/`probeFloor`); pass a mutated representation to
   * simulate an upper layer drifting and watch the Governor trip.
   */
  async supervise(claimed: Representation): Promise<SupervisoryResult> {
    const t = await twins(claimed, this.log)
    const m = await mayor(this.log, t)
    const g = this.governor.evaluate(m)
    const view: DoorView = {
      head: this.head(),
      eventCount: this.log.length,
      parity: t.parity,
      governorState: g.state,
      rho: project(this.log).floor.gated,
    }
    // The Central AI is optional: if its slot is bound, it observes the
    // metadata-only DoorView; if not, the system continues without it.
    const centralActor = this.bus.getActor("actor.central")
    const central = centralActor ? { id: centralActor.id, output: await centralActor.invoke(view) } : null
    return { twins: t, mayor: m, governor: g, door: observe(view), central, requirements: this.bus.requirements() }
  }

  /** Query through the Negotiator — refused while the Governor is in lockdown. */
  async query(request: NegotiationRequest): Promise<KernelQueryResult> {
    if (this.governor.state === "lockdown") {
      return { sufficient: false, locked: true, reasons: ["governor lockdown: queries refused until reset", ...this.governor.reasons] }
    }
    return negotiate(request, this.log)
  }

  resetGovernor(): void {
    this.governor.reset()
  }

  /** The unbound slots — what the system knows is supposed to be there but isn't yet. */
  requirements(): SlotRequirement[] {
    return this.bus.requirements()
  }

  /** The state of every declared slot (bound/unbound). */
  modules(): SlotStatus[] {
    return this.bus.status()
  }

  /** Bind an AI actor module into a slot at runtime (self-modification). */
  bindActor(name: string, actor: Actor): boolean {
    return this.bus.bindActor(name, actor)
  }

  /** Empty a slot, returning it to a defined hole. */
  unbind(name: string): boolean {
    return this.bus.unbind(name)
  }

  /** A read-only view of the trace (for a host front end / inspector). */
  snapshot(): readonly RawEvent[] {
    return this.log
  }
}

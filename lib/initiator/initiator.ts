/**
 * THE INITIATOR — both bootloader and kernel in one root.
 *
 * There is no boot step that hands off to a separate kernel, and no middleman
 * between the root of trust and the interface. The Initiator boots itself
 * (attest + seal), then runs as the kernel: every state transition goes through
 * the Twins → Mayor → Governor hierarchy, the Central AI sees only the Door's
 * metadata, and Negotiator queries are answered only while the Governor is
 * nominal.
 *
 * Crucially, every operation is routed through one audited dispatch (`audited`):
 * each function is logged and clocked — a monotonic tick, its timing, and a
 * post-state digest, hash-chained in the audit log. Because this is the sole
 * entry point, nothing reaches the interface unlogged or unclocked, which is
 * what makes the zero-trust audit safe: trust nothing, verify the whole record.
 *
 * Lifecycle: `Initiator.boot()` → `step(input)` / `probeFloor()` per transition
 * → `query(request)`. A proven discrepancy anywhere trips the Governor and seals
 * the Door and queries until `resetGovernor()`.
 */
import type { RawEvent, Representation } from "../integrity/types.ts"
import type { FloorProbe, RawInput } from "../integrity/source.ts"
import type { TraceStore } from "../integrity/persistence.ts"
import type { NegotiationRequest, NegotiationVerdict } from "../integrity/negotiator.ts"
import { GENESIS, canonicalize, sha256Hex } from "../integrity/hash.ts"
import { project } from "../integrity/projection.ts"
import { ingestInput, ingestWitnesses } from "../integrity/trace.ts"
import { negotiate } from "../integrity/negotiator.ts"
import { browserFloorProbe } from "../integrity/floor-probe.ts"
import { boot, type BootReport } from "./boot.ts"
import { AuditLog, type AuditRecord } from "./audit.ts"
import { twins, type TwinsResult } from "../kernel/twins.ts"
import { mayor, type MayorVerdict } from "../kernel/mayor.ts"
import { Governor, type GovernorDecision } from "../kernel/governor.ts"
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

export interface InitiatorState {
  head: string
  eventCount: number
  governor: "nominal" | "lockdown"
  floor: Representation["floor"]
  /** The audit clock: how many functions have been logged. */
  clock: number
}

/** A query refused because the Governor is in lockdown. */
export interface LockedVerdict {
  sufficient: false
  locked: true
  reasons: string[]
}

export type InitiatorQueryResult = NegotiationVerdict | LockedVerdict

export class Initiator {
  private log: RawEvent[]
  private readonly store: TraceStore
  private readonly probe: FloorProbe | null
  private readonly governor: Governor
  private readonly bus: ModuleBus
  private readonly audit: AuditLog
  readonly bootReport: BootReport

  private constructor(
    log: RawEvent[],
    store: TraceStore,
    probe: FloorProbe | null,
    governor: Governor,
    bus: ModuleBus,
    audit: AuditLog,
    bootReport: BootReport,
  ) {
    this.log = log
    this.store = store
    this.probe = probe
    this.governor = governor
    this.bus = bus
    this.audit = audit
    this.bootReport = bootReport
  }

  static async boot(opts: { store?: TraceStore; probe?: FloorProbe | null; bus?: ModuleBus } = {}): Promise<Initiator> {
    const startedAt = Date.now()
    const t0 = performance.now()
    const probe = opts.probe === undefined ? browserFloorProbe : opts.probe
    const { report, log, store } = await boot({ store: opts.store, probe })
    const governor = new Governor()
    // Boot attestation: a broken prior chain locks the system down immediately.
    if (!report.sealed) {
      governor.evaluate({ halt: true, reason: "boot attestation failed: prior chain not sealed" })
    }
    // Declare the standard slots (AI actors + silicon substrate), all unbound.
    const bus = opts.bus ?? createOsBus()
    const audit = new AuditLog()
    const initiator = new Initiator(log, store, probe, governor, bus, audit, report)
    // Boot is itself the first clocked, logged function (tick 1).
    const durationMs = Math.round((performance.now() - t0) * 1000) / 1000
    await audit.record({ fn: "boot", startedAt, durationMs, ok: report.sealed, digest: await initiator.stateDigest() })
    return initiator
  }

  // --- introspection (pure reads, outside the audited dispatch) ---

  get state(): InitiatorState {
    const rep = project(this.log)
    return {
      head: this.head(),
      eventCount: this.log.length,
      governor: this.governor.state,
      floor: rep.floor,
      clock: this.audit.tick,
    }
  }

  private head(): string {
    return this.log.length ? this.log[this.log.length - 1].hash : GENESIS
  }

  /**
   * The post-state an audit record commits to. It includes the module bus so a
   * bind/unbind is fingerprinted, not just operations that move the trace head.
   */
  private async stateDigest(): Promise<string> {
    return sha256Hex(
      canonicalize({
        head: this.head(),
        governor: this.governor.state,
        eventCount: this.log.length,
        modules: this.bus.status(),
      }),
    )
  }

  /** The unbound slots — what the system knows is supposed to be there but isn't yet. */
  requirements(): SlotRequirement[] {
    return this.bus.requirements()
  }

  /** The state of every declared slot (bound/unbound). */
  modules(): SlotStatus[] {
    return this.bus.status()
  }

  /** A read-only view of the trace (for a host front end / inspector). */
  snapshot(): readonly RawEvent[] {
    return this.log
  }

  /** The current audit clock value. */
  clock(): number {
    return this.audit.tick
  }

  /** The clocked, hash-chained record of every function the Initiator has run. */
  auditLog(): readonly AuditRecord[] {
    return this.audit.entries()
  }

  /** Verify the audit chain and that its clock is gap-free — the zero-trust audit. */
  verifyAudit(): Promise<{ valid: boolean; brokenAt: number | null }> {
    return this.audit.verify()
  }

  // --- audited operations (every one logged + clocked) ---

  /** Admit an input: append it to the trace, then run the supervisory pipeline. */
  async step(input: RawInput): Promise<SupervisoryResult> {
    return this.audited("step", async () => {
      this.log = await ingestInput(this.log, input)
      await this.store.save(this.log)
      return this._supervise(project(this.log))
    })
  }

  /** Map the floor: run the probe, chain the witnesses in, then supervise. */
  async probeFloor(): Promise<SupervisoryResult> {
    return this.audited("probeFloor", async () => {
      if (this.probe) {
        const witnesses = await this.probe.run()
        this.log = await ingestWitnesses(this.log, witnesses)
        await this.store.save(this.log)
      }
      return this._supervise(project(this.log))
    })
  }

  /**
   * Supervise a *claimed* representation against the trace. Normally the claim is
   * the honest fold (from `step`/`probeFloor`); pass a mutated representation to
   * simulate an upper layer drifting and watch the Governor trip.
   */
  async supervise(claimed: Representation): Promise<SupervisoryResult> {
    return this.audited("supervise", () => this._supervise(claimed))
  }

  /** Query through the Negotiator — refused while the Governor is in lockdown. */
  async query(request: NegotiationRequest): Promise<InitiatorQueryResult> {
    return this.audited("query", async () => {
      if (this.governor.state === "lockdown") {
        return {
          sufficient: false,
          locked: true,
          reasons: ["governor lockdown: queries refused until reset", ...this.governor.reasons],
        } satisfies LockedVerdict
      }
      return negotiate(request, this.log)
    })
  }

  /** Bind an AI actor module into a slot at runtime (self-modification). */
  async bindActor(name: string, actor: Actor): Promise<boolean> {
    return this.audited("bindActor", () => this.bus.bindActor(name, actor))
  }

  /** Empty a slot, returning it to a defined hole. */
  async unbind(name: string): Promise<boolean> {
    return this.audited("unbind", () => this.bus.unbind(name))
  }

  /** Clear the Governor's lockdown. */
  async resetGovernor(): Promise<void> {
    return this.audited("resetGovernor", () => {
      this.governor.reset()
    })
  }

  // --- internals ---

  private async _supervise(claimed: Representation): Promise<SupervisoryResult> {
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

  /**
   * All dispatched operations run strictly one at a time, in arrival order.
   * Without this, concurrent steps read the same chain head, all append off it,
   * and last-write-wins silently drops events — an unlogged transition, the one
   * thing this system exists to make impossible. Serializing here, in the sole
   * dispatch, also makes tick order equal true execution order.
   */
  private queue: Promise<unknown> = Promise.resolve()

  /**
   * The sole dispatch: queue the function, run it, then log it with a monotonic
   * clock tick, its timing, whether it completed, and a digest of the resulting
   * state. No state-affecting operation exists outside this path — that is the
   * "no middleman" guarantee the zero-trust audit rests on.
   */
  private audited<T>(fn: string, run: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(() => this.runAudited(fn, run))
    // Keep the queue alive even when an operation throws.
    this.queue = next.catch(() => undefined)
    return next
  }

  private async runAudited<T>(fn: string, run: () => Promise<T> | T): Promise<T> {
    const startedAt = Date.now()
    const t0 = performance.now()
    let ok = true
    try {
      return await run()
    } catch (err) {
      ok = false
      throw err
    } finally {
      const durationMs = Math.round((performance.now() - t0) * 1000) / 1000
      await this.audit.record({ fn, startedAt, durationMs, ok, digest: await this.stateDigest() })
    }
  }
}

/**
 * The module bus: the registry of the system's typed slots.
 *
 * Every replaceable piece — the three AI actors and the host silicon substrate —
 * is a named slot, declared unbound by default. The bus reports which slots are
 * holes (`requirements()`), lets modules be bound and rebound at runtime
 * (self-modification), and never throws for an empty slot. The design-level
 * pieces of the architecture are literally these unbound slots: the running
 * system knows what is supposed to be there and what it must provide.
 */
import type { Actor } from "./actor.ts"
import { isActor } from "./actor.ts"
import { Slot, type Contract, type SlotRequirement, type SlotStatus } from "./slot.ts"

export class ModuleBus {
  private readonly slots = new Map<string, Slot<unknown>>()

  declare(contract: Contract, initial: unknown = null): void {
    this.slots.set(contract.name, new Slot<unknown>(contract, initial))
  }

  has(name: string): boolean {
    return this.slots.has(name)
  }

  /** Bind any module to a slot. Returns false if the slot was never declared. */
  bind(name: string, module: unknown): boolean {
    const slot = this.slots.get(name)
    if (!slot) return false
    slot.bind(module)
    return true
  }

  /** Bind an actor, validating the contract first. Returns false on an unknown slot or invalid actor. */
  bindActor(name: string, actor: Actor): boolean {
    if (!isActor(actor)) return false
    return this.bind(name, actor)
  }

  unbind(name: string): boolean {
    const slot = this.slots.get(name)
    if (!slot) return false
    slot.unbind()
    return true
  }

  /** The bound actor at a slot, or null when the slot is empty / not an actor. */
  getActor(name: string): Actor | null {
    const value = this.slots.get(name)?.peek() ?? null
    return isActor(value) ? value : null
  }

  /** Every unbound slot, as a minimum-requirement list — the self-defined roadblocks. */
  requirements(): SlotRequirement[] {
    const out: SlotRequirement[] = []
    for (const slot of this.slots.values()) {
      const req = slot.requirement()
      if (req) out.push(req)
    }
    return out
  }

  status(): SlotStatus[] {
    return Array.from(this.slots.values(), (s) => s.status())
  }
}

/**
 * A bus pre-declaring the standard OS slots, all unbound. These are exactly the
 * pieces the architecture leaves open: the three AI actors and the silicon
 * substrate. The kernel runs with every one of them empty.
 */
export function createOsBus(): ModuleBus {
  const bus = new ModuleBus()
  bus.declare({
    name: "actor.prediction",
    rung: "CODE",
    provides: ["invoke"],
    purpose: "Twin-1 prediction/enhancement; optional — deterministic parity runs without it",
  })
  bus.declare({
    name: "actor.truth-bound",
    rung: "CODE",
    provides: ["invoke"],
    purpose: "Twin-2 truth-bound reasoning; optional — the trace is the deterministic truth without it",
  })
  bus.declare({
    name: "actor.central",
    rung: "INTERFACE",
    provides: ["invoke"],
    purpose: "Central AI apex reasoning behind the State Transition Door; optional",
  })
  bus.declare({
    name: "substrate.silicon",
    rung: "VOLTAGE",
    provides: ["start", "run"],
    purpose: "host/hardware EventSource + FloorProbe to ground claims below MACHINE",
  })
  return bus
}

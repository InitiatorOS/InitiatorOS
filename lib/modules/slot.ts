/**
 * The self-building primitive.
 *
 * When the system meets a piece that is not yet defined, it does not ignore it
 * and it does not fake it. It declares a `Slot`: a typed hole that the whole
 * stack agrees is *supposed* to be there, with the functions an implementation
 * must provide. A slot is either bound to a module or an explicitly **defined
 * undefined-variable** — resolving it never throws, it reports its own contract.
 *
 * A roadblock therefore becomes a variable with a known shape, not a crash. The
 * system keeps running around an empty slot (degraded, but functioning) and can
 * emit the minimum requirement to fill it — which is how it "figures out the
 * minimum requirements to change what it doesn't know."
 */
import type { Rung } from "../integrity/layers.ts"

/** A declared-but-unfilled hole: what is supposed to be here, and the functions it must provide. */
export interface Contract {
  /** Stable slot name, e.g. "actor.central", "substrate.silicon". */
  name: string
  /** Which rung this slot serves. */
  rung: Rung
  /** The functions an implementation must provide (names, for reporting/validation). */
  provides: string[]
  /** What it enables / why the system wants it. */
  purpose: string
}

/** The minimum-requirement descriptor emitted for an unbound slot. */
export interface SlotRequirement {
  kind: "unbound-slot"
  name: string
  rung: Rung
  provides: string[]
  detail: string
}

/** A reportable view of a slot's current state. */
export interface SlotStatus {
  name: string
  rung: Rung
  bound: boolean
  provides: string[]
}

export class Slot<T> {
  readonly contract: Contract
  private value: T | null

  constructor(contract: Contract, initial: T | null = null) {
    this.contract = contract
    this.value = initial
  }

  get bound(): boolean {
    return this.value !== null
  }

  bind(module: T): void {
    this.value = module
  }

  unbind(): void {
    this.value = null
  }

  /** The bound module, or null when the slot is a defined hole. Never throws. */
  peek(): T | null {
    return this.value
  }

  /** The requirement describing the hole, or null when the slot is bound. */
  requirement(): SlotRequirement | null {
    if (this.bound) return null
    return {
      kind: "unbound-slot",
      name: this.contract.name,
      rung: this.contract.rung,
      provides: this.contract.provides,
      detail: `unbound: ${this.contract.purpose}; bind a module providing [${this.contract.provides.join(", ")}]`,
    }
  }

  status(): SlotStatus {
    return { name: this.contract.name, rung: this.contract.rung, bound: this.bound, provides: this.contract.provides }
  }
}

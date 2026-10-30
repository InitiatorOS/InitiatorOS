/**
 * AI actors as replaceable modules.
 *
 * The three AI roles are deliberately distinct and all hot-swappable. The system
 * must never brick because an actor is absent — an empty actor slot is a defined
 * hole (see `slot.ts`), and the kernel's deterministic floor (trace, reconciler,
 * Mayor, Governor) runs with no actors bound at all. Actors are *enhancements*
 * plugged into defined hook points, and an actor's output is INERT: it is
 * attached to the result for observation, influences no state, and is not
 * itself verified. It cannot corrupt the floor because nothing downstream
 * consumes it as truth — but inert is not the same as verified, and this
 * comment says which one it is.
 *
 * A module can wrap a `Neuronet`: a skill-specialized model used like a hammer —
 * the right tool reached for a task, instead of retraining one monolith or
 * feeding it an unreasonable amount of data. This file defines the seam; a real
 * model is plugged in behind `Neuronet`, it is not faked here.
 */

/** The three distinct roles. All three differ by contract. */
export type ActorKind = "prediction" | "truth-bound" | "central"

/** A skill-specialized callable — the "neuronet" a module can wrap as a tool. */
export interface Neuronet {
  readonly skill: string
  evaluate(input: unknown): Promise<unknown> | unknown
}

/** The replaceable AI module contract. */
export interface Actor {
  readonly id: string
  readonly kind: ActorKind
  readonly skill?: string
  invoke(input: unknown): Promise<unknown>
}

/** True when a value satisfies the Actor contract — used before binding to a slot. */
export function isActor(value: unknown): value is Actor {
  if (typeof value !== "object" || value === null) return false
  const a = value as Record<string, unknown>
  return typeof a.id === "string" && typeof a.kind === "string" && typeof a.invoke === "function"
}

/**
 * Wrap a neuronet as an actor — reach for an optimal specialized net as a tool.
 * The adapter is the only thing the kernel sees; swap the net without touching
 * the kernel.
 */
export function neuronetActor(id: string, kind: ActorKind, net: Neuronet): Actor {
  return {
    id,
    kind,
    skill: net.skill,
    async invoke(input: unknown): Promise<unknown> {
      return net.evaluate(input)
    },
  }
}

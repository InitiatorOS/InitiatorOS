/**
 * The representation stack and its field registry.
 *
 * Your model: a physical state transition (voltage, high/low) is abstracted into
 * a machine-readable form, abstracted again into human-readable code that
 * compiles back to bits, and finally presented as a UI representation. Each rung
 * does not reliably declare *which* rung it is — that ambiguity is exactly what
 * the Negotiator exists to resolve.
 *
 * The rungs are ordered ground-truth-first, so "deeper" (lower index) means
 * closer to the physical substrate and therefore more authoritative.
 */
import type { RawEvent, Representation } from "./types.ts"
import { GENESIS, canonicalize } from "./hash.ts"
import { project } from "./projection.ts"

export type Rung = "VOLTAGE" | "MACHINE" | "CODE" | "INTERFACE"

/** Ground-truth-first ordering: index 0 is closest to the physical substrate. */
export const RUNGS: readonly Rung[] = ["VOLTAGE", "MACHINE", "CODE", "INTERFACE"]

export function rungIndex(r: Rung): number {
  return RUNGS.indexOf(r)
}

/** True when `a` is strictly closer to ground truth than `b` (more authoritative). */
export function isDeeper(a: Rung, b: Rung): boolean {
  return rungIndex(a) < rungIndex(b)
}

/**
 * The deepest rung this runtime can actually *formulate*. VOLTAGE lives below
 * any JS runtime, so without a host substrate adapter the hash-chained MACHINE
 * trace is as deep as a representation can be grounded here. Claims that require
 * VOLTAGE are reported as needing that adapter rather than fabricated.
 */
export const DEEPEST_FORMULABLE: Rung = "MACHINE"

export interface FormulationContext {
  log: readonly RawEvent[]
  rep: Representation
  head: string
}

export interface FieldSpec {
  rung: Rung
  resolve: (ctx: FormulationContext) => string
}

const codeScalar = (key: keyof Representation): FieldSpec => ({
  rung: "CODE",
  resolve: ({ rep }) => canonicalize(rep[key]),
})

/**
 * Every field the Negotiator knows how to formulate, and the rung at which it is
 * formulated. MACHINE fields read the trace directly; CODE fields are the
 * deterministic fold; the INTERFACE field is a human view derived from CODE.
 */
export const FIELD_REGISTRY: Record<string, FieldSpec> = {
  chainHead: { rung: "MACHINE", resolve: ({ head }) => head },
  eventCount: { rung: "MACHINE", resolve: ({ log }) => String(log.length) },

  keyPresses: codeScalar("keyPresses"),
  scrolls: codeScalar("scrolls"),
  pointerSamples: codeScalar("pointerSamples"),
  pointerDistance: codeScalar("pointerDistance"),
  bounds: codeScalar("bounds"),
  lastPointer: codeScalar("lastPointer"),

  "floor.probes": { rung: "CODE", resolve: ({ rep }) => String(rep.floor.probes) },
  "floor.reachable": { rung: "CODE", resolve: ({ rep }) => String(rep.floor.reachable) },
  "floor.absent": { rung: "CODE", resolve: ({ rep }) => String(rep.floor.absent) },
  "floor.gated": { rung: "CODE", resolve: ({ rep }) => String(rep.floor.gated) },

  "countsByType.pointer": { rung: "CODE", resolve: ({ rep }) => String(rep.countsByType.pointer) },
  "countsByType.click": { rung: "CODE", resolve: ({ rep }) => String(rep.countsByType.click) },
  "countsByType.key": { rung: "CODE", resolve: ({ rep }) => String(rep.countsByType.key) },
  "countsByType.scroll": { rung: "CODE", resolve: ({ rep }) => String(rep.countsByType.scroll) },
  "countsByType.witness": { rung: "CODE", resolve: ({ rep }) => String(rep.countsByType.witness) },

  summary: {
    rung: "INTERFACE",
    resolve: ({ rep, log }) =>
      `${log.length} events · ρ=${rep.floor.gated} proven restriction(s) across ${rep.floor.probes} probe(s)`,
  },
}

/** Build the formulation context once per negotiation: the fold plus the chain head. */
export function makeContext(log: readonly RawEvent[]): FormulationContext {
  const rep = project(log)
  const head = log.length ? log[log.length - 1].hash : GENESIS
  return { log, rep, head }
}

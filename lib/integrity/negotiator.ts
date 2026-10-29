/**
 * The Negotiator — representation gate and layer classifier ("super-compiler").
 *
 * A record is never simply handed out. The Negotiator asks, of every request:
 *   1. Which rung does this request actually come from? (It may not declare it
 *      honestly, so origin is inferred from the evidence the request carries.)
 *   2. What representation can be formulated along the stack for the fields it
 *      asks about, derived down toward ground truth?
 *   3. Is that representation SUFFICIENT or INSUFFICIENT?
 *
 * Sufficiency is defined mechanically (no floating words), and all four must hold:
 *   - grounded:        every requested field derives down to the trace.
 *   - complete:        every requested field is actually resolvable.
 *   - non-fabricating: no asserted value exceeds / contradicts what the trace
 *                      proves (e.g. claiming more `gated` restrictions than were
 *                      witnessed).
 *   - layer-honest:    the request does not declare deeper (more authoritative)
 *                      rung than its evidence supports.
 *
 * On insufficiency the Negotiator does not improvise a value. Per the Twin-2
 * non-lie constraint, it returns the minimum requirement that would make the
 * representation sufficient: run a probe, re-reconcile, or supply the substrate
 * adapter for a physical (VOLTAGE) claim it cannot verify from here.
 */
import type { RawEvent } from "./types.ts"
import { canonicalize, sha256Hex } from "./hash.ts"
import {
  DEEPEST_FORMULABLE,
  FIELD_REGISTRY,
  type Rung,
  isDeeper,
  makeContext,
  rungIndex,
} from "./layers.ts"
import { type BaseForm, normalize } from "./normalize.ts"

/** A field the request wants represented, optionally with a value it already asserts. */
export interface Claim {
  field: string
  asserted?: string
}

/** Observable evidence used to classify the request's true origin rung. */
export interface RequestEvidence {
  citesTraceHash?: string
  citesRepresentation?: boolean
  rendersToHuman?: boolean
  citesVoltage?: boolean
}

export interface NegotiationRequest {
  /** The rung the request presents itself as — may be absent or dishonest. */
  declaredRung?: Rung
  claims: Claim[]
  evidence?: RequestEvidence
}

/** The minimum thing needed to turn an insufficient representation into a sufficient one. */
export type Requirement =
  | { kind: "substrate-adapter"; rung: "VOLTAGE"; detail: string }
  | { kind: "unknown-field"; field: string; detail: string }
  | { kind: "probe"; field: string; detail: string }
  | { kind: "reconcile"; field: string; detail: string }

export interface SufficientVerdict {
  sufficient: true
  originRung: Rung
  /** The highest rung that had to be climbed to formulate the answer. */
  formulatedRung: Rung
  /** The deepest rung actually verified down to (MACHINE here, absent a host adapter). */
  groundedTo: Rung
  /** The rung path from ground truth up to the formulated rung. */
  derivation: Rung[]
  representation: Record<string, string>
  /** The base-language form of the answer — the canonical IR the Negotiator sorts in. */
  base: BaseForm
  checksum: string
}

export interface InsufficientVerdict {
  sufficient: false
  originRung: Rung
  reasons: string[]
  missing: Requirement[]
}

export type NegotiationVerdict = SufficientVerdict | InsufficientVerdict

/** Infer the true origin rung from evidence: the most abstract layer the request engages. */
function classifyOrigin(ev: RequestEvidence | undefined): Rung {
  if (ev?.rendersToHuman) return "INTERFACE"
  if (ev?.citesRepresentation) return "CODE"
  if (ev?.citesTraceHash) return "MACHINE"
  // No evidence at all: assume the least authority rather than grant ground truth.
  return "INTERFACE"
}

/** Whether a mismatch is an over-claim of proven restrictions (needs a probe) vs. ordinary drift. */
function overClaimsRestriction(field: string, asserted: string, actual: string): boolean {
  if (field !== "floor.gated" && field !== "countsByType.witness" && field !== "floor.probes") return false
  const a = Number(asserted)
  const b = Number(actual)
  return Number.isFinite(a) && Number.isFinite(b) && a > b
}

export async function negotiate(
  req: NegotiationRequest,
  log: readonly RawEvent[],
): Promise<NegotiationVerdict> {
  const ctx = makeContext(log)
  const originRung = classifyOrigin(req.evidence)
  const reasons: string[] = []
  const missing: Requirement[] = []

  // (4) layer-honesty: declaring deeper authority than the evidence supports.
  if (req.declaredRung && isDeeper(req.declaredRung, originRung)) {
    reasons.push(
      `layer-honesty: declared '${req.declaredRung}' but evidence supports only '${originRung}' (claiming deeper authority than shown)`,
    )
  }

  // A physical (VOLTAGE) claim cannot be verified from this runtime.
  const physicalClaim = req.evidence?.citesVoltage || req.declaredRung === "VOLTAGE"
  if (physicalClaim) {
    reasons.push("physical grounding (VOLTAGE) cannot be verified from a JS runtime")
    missing.push({
      kind: "substrate-adapter",
      rung: "VOLTAGE",
      detail: "a host/hardware EventSource adapter must supply measured physical state; none is attached",
    })
  }

  const representation: Record<string, string> = {}
  let formulatedRung: Rung = originRung

  for (const claim of req.claims) {
    // A physical field the registry does not formulate -> needs the substrate adapter.
    if (claim.field.startsWith("voltage.")) {
      reasons.push(`field '${claim.field}' is a physical (VOLTAGE) measurement, not formulable here`)
      missing.push({
        kind: "substrate-adapter",
        rung: "VOLTAGE",
        detail: `'${claim.field}' requires a host/hardware adapter to measure`,
      })
      continue
    }

    const spec = FIELD_REGISTRY[claim.field]
    if (!spec) {
      // (2) completeness fails: cannot resolve the field at all.
      reasons.push(`field '${claim.field}' is unknown — cannot be formulated from the trace`)
      missing.push({ kind: "unknown-field", field: claim.field, detail: "no registry entry formulates this field" })
      continue
    }

    const actual = spec.resolve(ctx)

    // (3) non-fabrication: an asserted value must match what the trace yields.
    if (claim.asserted !== undefined && claim.asserted !== actual) {
      if (overClaimsRestriction(claim.field, claim.asserted, actual)) {
        reasons.push(
          `fabrication: '${claim.field}' asserted ${claim.asserted} but trace proves only ${actual}`,
        )
        missing.push({
          kind: "probe",
          field: claim.field,
          detail: "run a floor probe to witness the claimed restriction(s); the trace does not yet prove them",
        })
      } else {
        reasons.push(`drift: '${claim.field}' asserted ${claim.asserted} but trace yields ${actual}`)
        missing.push({
          kind: "reconcile",
          field: claim.field,
          detail: "re-fold the representation from the trace; the asserted value is out of band",
        })
      }
      continue
    }

    representation[claim.field] = actual
    if (rungIndex(spec.rung) > rungIndex(formulatedRung)) formulatedRung = spec.rung
  }

  if (reasons.length > 0 || missing.length > 0) {
    return { sufficient: false, originRung, reasons, missing }
  }

  // (1) grounded: resolvable fields fold from the MACHINE trace, so grounding
  // reaches the deepest rung this runtime can verify.
  const groundedTo = DEEPEST_FORMULABLE
  const derivation = RUNGS_FROM(groundedTo, formulatedRung)
  const base = await normalize(ctx, Object.keys(representation))
  const checksum = await sha256Hex(canonicalize(representation))
  return { sufficient: true, originRung, formulatedRung, groundedTo, derivation, representation, base, checksum }
}

/** The inclusive rung path from `deep` up to `shallow`. */
function RUNGS_FROM(deep: Rung, shallow: Rung): Rung[] {
  const lo = rungIndex(deep)
  const hi = Math.max(lo, rungIndex(shallow))
  const path: Rung[] = []
  const order: Rung[] = ["VOLTAGE", "MACHINE", "CODE", "INTERFACE"]
  for (let i = lo; i <= hi; i++) path.push(order[i])
  return path
}

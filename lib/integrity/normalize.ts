/**
 * The Negotiator's base language.
 *
 * To sort across the rung "dialects", the Negotiator needs one canonical form to
 * reason in — a base understanding. `normalize` compiles a set of fields,
 * whatever rung they arrived from, into a single de-tokenized, typed,
 * rung-tagged structural form (ISF_003), sorted into one canonical order. That
 * common form — and its `signature` — is the "different language" the Negotiator
 * emits so disparate representations can be compared and sorted accordingly.
 */
import type { FormulationContext, Rung } from "./layers.ts"
import { FIELD_REGISTRY } from "./layers.ts"
import { canonicalize, sha256Hex } from "./hash.ts"

export interface BaseTerm {
  field: string
  rung: Rung
  type: "number" | "string" | "struct"
  value: string
}

export interface BaseForm {
  terms: BaseTerm[]
  /** Hash of the canonical form — a stable id for this base understanding. */
  signature: string
}

const RUNG_ORDER: Record<Rung, number> = { VOLTAGE: 0, MACHINE: 1, CODE: 2, INTERFACE: 3 }

function termType(value: string): BaseTerm["type"] {
  if (/^-?\d+(\.\d+)?$/.test(value)) return "number"
  if (value.startsWith("{") || value.startsWith("[") || value === "null") return "struct"
  return "string"
}

export async function normalize(ctx: FormulationContext, fields: readonly string[]): Promise<BaseForm> {
  const terms: BaseTerm[] = []
  for (const field of fields) {
    const spec = FIELD_REGISTRY[field]
    if (!spec) continue
    const value = spec.resolve(ctx)
    terms.push({ field, rung: spec.rung, type: termType(value), value })
  }
  // Canonical order: ground-truth rung first, then field name. This is the sort
  // the base understanding makes possible.
  terms.sort((a, b) => RUNG_ORDER[a.rung] - RUNG_ORDER[b.rung] || a.field.localeCompare(b.field))
  const signature = await sha256Hex(canonicalize(terms))
  return { terms, signature }
}

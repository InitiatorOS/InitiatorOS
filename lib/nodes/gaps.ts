/**
 * The gap registry — every thing the system cannot properly audit, declared as
 * a variable with a known shape instead of a sentence in a ledger.
 *
 * Each entry carries the five boundary variables (ISF_003), the invariant it
 * leaves unproven (ISF_001), the pillars that rest on it (ISF_004), the
 * observable it is anchored to (ISF_005), and the minimum requirement that
 * would close it. `present(ctx)` derives from live state whether the gap holds
 * right now, wherever that is mechanically derivable; the two that are not
 * derivable (provenance, a design choice) say so by being unconditional.
 */
import type { AuditGap, NodeContext } from "./types.ts"

interface GapDef extends AuditGap {
  present: (ctx: NodeContext) => boolean
}

const isBound = (ctx: NodeContext, name: string): boolean =>
  ctx.modules.some((m) => m.name === name && m.bound)

export const GAP_REGISTRY: GapDef[] = [
  {
    id: "physical-telemetry-absent",
    statement: "No host/hardware source supplies measured physical state; nothing grounds below MACHINE.",
    anchor: { kind: "slot", ref: "substrate.silicon" },
    boundary: { observed: "absent", observer: "present", invariant: "present", persistence: "present", independence: "absent" },
    invariant: "a VOLTAGE-rung claim requires measured physical state, never a software proxy",
    pillars: ["VOLTAGE"],
    severity: 1,
    requirement: "bind substrate.silicon (a host EventSource + FloorProbe)",
    present: (ctx) => !isBound(ctx, "substrate.silicon"),
  },
  {
    id: "no-real-gated-witness",
    statement: "No real typed denial has been observed; the gated branch is exercised only by synthetic witnesses.",
    anchor: { kind: "field", ref: "floor.gated" },
    boundary: { observed: "absent", observer: "present", invariant: "present", persistence: "present", independence: "absent" },
    invariant: "ρ counts only handles that exist AND return a typed denial",
    pillars: ["CODE", "INTERFACE"],
    severity: 0.7,
    requirement: "run the floor probe in a runtime that gates at least one handle (a sandboxed browser)",
    present: (ctx) => ctx.rep.floor.gated === 0,
  },
  {
    id: "audit-unpersisted",
    statement: "The audit log lives in process memory and does not survive a restart.",
    anchor: { kind: "audit", ref: "AuditLog.entries" },
    boundary: { observed: "present", observer: "present", invariant: "present", persistence: "absent", independence: "absent" },
    invariant: "every function is logged and clocked in a gap-free chain that outlives the process",
    pillars: ["AUDIT"],
    severity: 0.8,
    requirement: "back the audit log with a durable store",
    present: (ctx) => !ctx.auditPersisted,
  },
  {
    id: "actor-output-unverified",
    statement: "A bound actor's output is attached for observation but nothing verifies it.",
    anchor: { kind: "slot", ref: "actor.*" },
    boundary: { observed: "present", observer: "absent", invariant: "present", persistence: "present", independence: "absent" },
    invariant: "actor output influences no state (inert)",
    pillars: [],
    severity: 0,
    requirement: "route actor output through reconcile/Mayor before anything consumes it",
    present: (ctx) => ctx.modules.some((m) => m.name.startsWith("actor.") && m.bound),
  },
  {
    id: "single-author-twins",
    statement: "The code and its tests share one author; Twin-1 and Twin-2 are not independent.",
    anchor: { kind: "provenance", ref: "author" },
    boundary: { observed: "present", observer: "present", invariant: "present", persistence: "present", independence: "absent" },
    invariant: "parity O₁ = O₂ is meaningful only when the twins are independent",
    pillars: ["MACHINE", "CODE", "INTERFACE", "AUDIT"],
    severity: 1,
    requirement: "an independent reviewer or a second, independently written implementation of the tests",
    present: () => true,
  },
  {
    id: "boot-single-tick",
    statement: "Boot is clocked as one audit tick; its sub-steps are not individually logged.",
    anchor: { kind: "audit", ref: "fn=boot" },
    boundary: { observed: "present", observer: "present", invariant: "absent", persistence: "present", independence: "absent" },
    invariant: "each function is logged and clocked",
    pillars: ["AUDIT"],
    severity: 0.3,
    requirement: "clock load / attest / probe / seal as separate ticks",
    present: (ctx) =>
      ctx.audit.filter((r) => r.fn === "boot").length === 1 && !ctx.audit.some((r) => r.fn.startsWith("boot.")),
  },
  {
    id: "reads-unaudited",
    statement: "Pure reads (state, requirements, modules, snapshot, clock, auditLog) bypass the audited dispatch by design.",
    anchor: { kind: "audit", ref: "dispatch" },
    boundary: { observed: "absent", observer: "absent", invariant: "present", persistence: "absent", independence: "absent" },
    invariant: "reads change no state; the design choice must be ratified or reversed",
    pillars: ["AUDIT"],
    severity: 0.3,
    requirement: "ratify reads as unaudited, or route them through the dispatch",
    present: () => true,
  },
]

/** The gaps that hold right now, as plain `AuditGap`s. */
export function deriveGaps(ctx: NodeContext): AuditGap[] {
  return GAP_REGISTRY.filter((g) => g.present(ctx)).map(({ present: _present, ...gap }) => gap)
}

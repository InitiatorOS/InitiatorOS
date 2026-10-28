import { test } from "node:test"
import assert from "node:assert/strict"

import { ingestInput, ingestWitnesses } from "../lib/integrity/trace.ts"
import { negotiate } from "../lib/integrity/negotiator.ts"
import type { RawEvent, WitnessRecord } from "../lib/integrity/types.ts"

/** A deterministic trace: keyPresses=1, pointerDistance=5, floor={probes:2,reachable:1,absent:0,gated:1}. */
async function sampleTrace(): Promise<RawEvent[]> {
  let log: RawEvent[] = []
  log = await ingestInput(log, { type: "pointer", data: { x: 0, y: 0 } })
  log = await ingestInput(log, { type: "pointer", data: { x: 3, y: 4 } })
  log = await ingestInput(log, { type: "click", data: { x: 10, y: 10 } })
  log = await ingestInput(log, { type: "key", data: { code: 65 } })
  const witnesses: WitnessRecord[] = [
    { handle: "a", label: "reachable one", status: "reachable", detail: "ok" },
    { handle: "c", label: "gated one", status: "gated", detail: "SecurityError" },
  ]
  return ingestWitnesses(log, witnesses, 7)
}

test("formulates CODE fields and grounds them to the MACHINE trace", async () => {
  const log = await sampleTrace()
  const v = await negotiate({ claims: [{ field: "keyPresses" }, { field: "floor.gated" }], evidence: { citesRepresentation: true } }, log)
  if (!v.sufficient) throw new Error(`expected sufficient, got ${JSON.stringify(v.reasons)}`)
  assert.equal(v.formulatedRung, "CODE")
  assert.equal(v.groundedTo, "MACHINE")
  assert.deepEqual(v.derivation, ["MACHINE", "CODE"])
  assert.equal(v.representation.keyPresses, "1")
  assert.equal(v.representation["floor.gated"], "1")
})

test("an asserted value that matches the trace is sufficient", async () => {
  const log = await sampleTrace()
  const v = await negotiate({ claims: [{ field: "floor.gated", asserted: "1" }], evidence: { citesRepresentation: true } }, log)
  assert.equal(v.sufficient, true)
})

test("ordinary drift is insufficient and demands a re-reconcile", async () => {
  const log = await sampleTrace()
  const v = await negotiate({ claims: [{ field: "keyPresses", asserted: "9" }], evidence: { citesRepresentation: true } }, log)
  if (v.sufficient) throw new Error("expected insufficient")
  assert.ok(v.reasons.some((r) => r.includes("drift")))
  assert.ok(v.missing.some((m) => m.kind === "reconcile"))
})

test("over-claiming restrictions demands a probe, never a fabricated value", async () => {
  const log = await sampleTrace()
  const v = await negotiate({ claims: [{ field: "floor.gated", asserted: "5" }], evidence: { citesRepresentation: true } }, log)
  if (v.sufficient) throw new Error("expected insufficient")
  assert.ok(v.reasons.some((r) => r.includes("fabrication")))
  assert.ok(v.missing.some((m) => m.kind === "probe"))
})

test("an unknown field cannot be formulated", async () => {
  const log = await sampleTrace()
  const v = await negotiate({ claims: [{ field: "does.not.exist" }] }, log)
  if (v.sufficient) throw new Error("expected insufficient")
  assert.ok(v.missing.some((m) => m.kind === "unknown-field"))
})

test("a physical (VOLTAGE) claim cannot be verified without a substrate adapter", async () => {
  const log = await sampleTrace()
  const v = await negotiate(
    { declaredRung: "VOLTAGE", claims: [{ field: "voltage.rail0" }], evidence: { rendersToHuman: true } },
    log,
  )
  if (v.sufficient) throw new Error("expected insufficient")
  assert.ok(v.missing.some((m) => m.kind === "substrate-adapter" && m.rung === "VOLTAGE"))
  // Also an over-claim of authority: declared VOLTAGE while only rendering to a human.
  assert.ok(v.reasons.some((r) => r.includes("layer-honesty")))
})

test("declaring deeper authority than the evidence shows is a layer-honesty failure", async () => {
  const log = await sampleTrace()
  const v = await negotiate(
    { declaredRung: "MACHINE", claims: [{ field: "summary" }], evidence: { rendersToHuman: true } },
    log,
  )
  if (v.sufficient) throw new Error("expected insufficient")
  assert.equal(v.originRung, "INTERFACE")
  assert.ok(v.reasons.some((r) => r.includes("layer-honesty")))
})

test("a human-facing summary formulates across the whole stack", async () => {
  const log = await sampleTrace()
  const v = await negotiate(
    { declaredRung: "INTERFACE", claims: [{ field: "summary" }], evidence: { rendersToHuman: true } },
    log,
  )
  if (!v.sufficient) throw new Error(`expected sufficient, got ${JSON.stringify(v.reasons)}`)
  assert.equal(v.formulatedRung, "INTERFACE")
  assert.deepEqual(v.derivation, ["MACHINE", "CODE", "INTERFACE"])
  assert.match(v.representation.summary, /ρ=1 proven restriction/)
})

test("a MACHINE-only claim grounds at a single rung and returns the chain head", async () => {
  const log = await sampleTrace()
  const v = await negotiate({ claims: [{ field: "chainHead" }], evidence: { citesTraceHash: "x" } }, log)
  if (!v.sufficient) throw new Error("expected sufficient")
  assert.equal(v.formulatedRung, "MACHINE")
  assert.deepEqual(v.derivation, ["MACHINE"])
  assert.match(v.representation.chainHead, /^[0-9a-f]{64}$/)
})

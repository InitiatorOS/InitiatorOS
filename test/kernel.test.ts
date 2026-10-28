import { test } from "node:test"
import assert from "node:assert/strict"

import { Kernel } from "../lib/kernel/kernel.ts"
import { twins } from "../lib/kernel/twins.ts"
import { mayor } from "../lib/kernel/mayor.ts"
import { Governor } from "../lib/kernel/governor.ts"
import { observe } from "../lib/central/door.ts"
import { boot } from "../lib/boot/initiator.ts"
import { memoryStore } from "../lib/integrity/persistence.ts"
import { ingestInput } from "../lib/integrity/trace.ts"
import { project } from "../lib/integrity/projection.ts"
import type { RawEvent } from "../lib/integrity/types.ts"

/** Boot with no startup probe so logs stay deterministic. */
const quietBoot = () => Kernel.boot({ store: memoryStore(), probe: null })

test("boot on an empty store seals a valid (empty) chain", async () => {
  const { report } = await boot({ store: memoryStore(), probe: null })
  assert.equal(report.chainValid, true)
  assert.equal(report.sealed, true)
  assert.equal(report.eventCount, 0)
})

test("boot attestation fails on a tampered prior chain and the kernel locks down", async () => {
  // Build a valid trace, then tamper one event's content before persisting it.
  let log: RawEvent[] = []
  log = await ingestInput(log, { type: "key", data: { code: 1 } })
  log = await ingestInput(log, { type: "key", data: { code: 2 } })
  const tampered = log.map((e, i) => (i === 0 ? { ...e, data: { code: 999 } } : e))

  const { report } = await boot({ store: memoryStore(tampered), probe: null })
  assert.equal(report.chainValid, false)
  assert.equal(report.sealed, false)

  const kernel = await Kernel.boot({ store: memoryStore(tampered), probe: null })
  assert.equal(kernel.state.governor, "lockdown")
  const q = await kernel.query({ claims: [{ field: "eventCount" }], evidence: { citesTraceHash: "x" } })
  assert.equal(q.sufficient, false)
  assert.ok("locked" in q && q.locked)
})

test("honest steps keep parity, stay nominal, and hold the door open", async () => {
  const kernel = await quietBoot()
  const r = await kernel.step({ type: "pointer", data: { x: 1, y: 1 } })
  assert.equal(r.twins.parity, true)
  assert.equal(r.mayor.halt, false)
  assert.equal(r.governor.state, "nominal")
  assert.equal(r.door.admitted, true)
})

test("a lying upper layer trips the Governor, seals the door, and blocks queries", async () => {
  const kernel = await quietBoot()
  await kernel.step({ type: "key", data: { code: 65 } })

  const lying = project(kernel.snapshot())
  lying.keyPresses += 10 // claim work the trace never recorded

  const sup = await kernel.supervise(lying)
  assert.equal(sup.twins.parity, false)
  assert.equal(sup.mayor.halt, true)
  assert.equal(sup.governor.state, "lockdown")
  assert.equal(sup.door.admitted, false)

  // Lockdown is sticky: an honest query is still refused until reset.
  const locked = await kernel.query({ claims: [{ field: "keyPresses" }], evidence: { citesRepresentation: true } })
  assert.equal(locked.sufficient, false)
  assert.ok("locked" in locked && locked.locked)

  kernel.resetGovernor()
  assert.equal(kernel.state.governor, "nominal")
  const after = await kernel.query({ claims: [{ field: "keyPresses" }], evidence: { citesRepresentation: true } })
  if (!after.sufficient) throw new Error("expected sufficient after reset")
  assert.equal(after.representation.keyPresses, "1")
})

test("twins parity is exactly the honest-fold check", async () => {
  let log: RawEvent[] = []
  log = await ingestInput(log, { type: "scroll", data: { dy: 1 } })
  const honest = await twins(project(log), log)
  assert.equal(honest.parity, true)
  assert.equal(honest.o1Checksum, honest.o2Checksum)

  const drifted = project(log)
  drifted.scrolls = 99
  const bad = await twins(drifted, log)
  assert.equal(bad.parity, false)
  assert.notEqual(bad.o1Checksum, bad.o2Checksum)
})

test("the Mayor halts on a broken chain, reading only trace facts", async () => {
  let log: RawEvent[] = []
  log = await ingestInput(log, { type: "key", data: { code: 1 } })
  log = await ingestInput(log, { type: "key", data: { code: 2 } })
  const tampered = log.map((e, i) => (i === 1 ? { ...e, data: { code: 999 } } : e))
  const v = await mayor(tampered, { parity: true })
  assert.equal(v.halt, true)
  assert.match(v.reason, /chain broken/)
})

test("the Governor stays in lockdown until explicitly reset", () => {
  const g = new Governor()
  assert.equal(g.evaluate({ halt: false, reason: "ok" }).admit, true)
  g.evaluate({ halt: true, reason: "discrepancy" })
  assert.equal(g.state, "lockdown")
  // A subsequent nominal verdict does not clear it.
  assert.equal(g.evaluate({ halt: false, reason: "ok" }).admit, false)
  g.reset()
  assert.equal(g.state, "nominal")
})

test("the Door admits only on metadata and never receives the trace", () => {
  const open = observe({ head: "abc", eventCount: 10, parity: true, governorState: "nominal", rho: 2 })
  assert.equal(open.admitted, true)
  assert.equal(open.pressure, 0.2)

  const sealed = observe({ head: "abc", eventCount: 10, parity: true, governorState: "lockdown", rho: 2 })
  assert.equal(sealed.admitted, false)
})

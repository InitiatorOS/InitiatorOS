import { test } from "node:test"
import assert from "node:assert/strict"

import { AuditLog } from "../lib/initiator/audit.ts"
import { Initiator } from "../lib/initiator/initiator.ts"
import { memoryStore } from "../lib/integrity/persistence.ts"

const quietBoot = () => Initiator.boot({ store: memoryStore(), probe: null })

test("the audit log clocks each entry with a contiguous, chained tick", async () => {
  const log = new AuditLog()
  await log.record({ fn: "a", startedAt: 1, durationMs: 0, ok: true, digest: "x" })
  await log.record({ fn: "b", startedAt: 2, durationMs: 0, ok: true, digest: "y" })
  const entries = log.entries()
  assert.deepEqual(entries.map((e) => e.tick), [1, 2])
  assert.equal(log.tick, 2)
  const v = await log.verify()
  assert.equal(v.valid, true)
})

test("tampering an audit record breaks the chain at that tick", async () => {
  const log = new AuditLog()
  await log.record({ fn: "a", startedAt: 1, durationMs: 0, ok: true, digest: "x" })
  await log.record({ fn: "b", startedAt: 2, durationMs: 0, ok: true, digest: "y" })
  // Mutating a recorded field after the fact must be detectable.
  const mutable = log.entries() as unknown as { fn: string }[]
  mutable[0].fn = "forged"
  const v = await log.verify()
  assert.equal(v.valid, false)
  assert.equal(v.brokenAt, 0)
})

test("boot is the first logged function, and every operation is clocked", async () => {
  const kernel = await quietBoot()
  assert.equal(kernel.clock(), 1) // boot == tick 1
  assert.equal(kernel.auditLog()[0].fn, "boot")

  await kernel.step({ type: "key", data: { code: 1 } })
  await kernel.query({ claims: [{ field: "eventCount" }], evidence: { citesTraceHash: "x" } })
  await kernel.bindActor("actor.central", { id: "c", kind: "central", invoke: async () => 1 })

  const fns = kernel.auditLog().map((r) => r.fn)
  assert.deepEqual(fns, ["boot", "step", "query", "bindActor"])
  assert.equal(kernel.clock(), 4)

  const v = await kernel.verifyAudit()
  assert.equal(v.valid, true)
})

test("the audit survives a lockdown: a failed-parity supervise is still logged", async () => {
  const kernel = await quietBoot()
  await kernel.step({ type: "key", data: { code: 1 } })

  // A query refused by lockdown is still an audited function — nothing bypasses it.
  const { project } = await import("../lib/integrity/projection.ts")
  const lying = project(kernel.snapshot())
  lying.keyPresses += 5
  await kernel.supervise(lying) // trips governor

  const before = kernel.clock()
  const refused = await kernel.query({ claims: [{ field: "eventCount" }], evidence: { citesTraceHash: "x" } })
  assert.equal(refused.sufficient, false)
  assert.equal(kernel.clock(), before + 1) // the refused query was still clocked
  assert.equal(kernel.auditLog().at(-1)?.fn, "query")

  const v = await kernel.verifyAudit()
  assert.equal(v.valid, true)
})

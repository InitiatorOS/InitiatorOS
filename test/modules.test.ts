import { test } from "node:test"
import assert from "node:assert/strict"

import { Slot } from "../lib/modules/slot.ts"
import { ModuleBus, createOsBus } from "../lib/modules/bus.ts"
import { type Actor, isActor, neuronetActor } from "../lib/modules/actor.ts"
import { Kernel } from "../lib/kernel/kernel.ts"
import { memoryStore } from "../lib/integrity/persistence.ts"
import { negotiate } from "../lib/integrity/negotiator.ts"
import { ingestInput } from "../lib/integrity/trace.ts"
import type { RawEvent } from "../lib/integrity/types.ts"

const quietBoot = () => Kernel.boot({ store: memoryStore(), probe: null })

test("an unbound slot is a defined hole, not a crash", () => {
  const slot = new Slot<Actor>({ name: "actor.central", rung: "INTERFACE", provides: ["invoke"], purpose: "apex" })
  assert.equal(slot.bound, false)
  assert.equal(slot.peek(), null)
  const req = slot.requirement()
  assert.ok(req)
  assert.equal(req.name, "actor.central")
  assert.deepEqual(req.provides, ["invoke"])

  const actor: Actor = { id: "a", kind: "central", invoke: async () => 1 }
  slot.bind(actor)
  assert.equal(slot.bound, true)
  assert.equal(slot.peek(), actor)
  assert.equal(slot.requirement(), null)

  slot.unbind()
  assert.equal(slot.bound, false)
  assert.ok(slot.requirement())
})

test("the standard OS bus declares four unbound slots", () => {
  const bus = createOsBus()
  const reqs = bus.requirements()
  const names = reqs.map((r) => r.name).sort()
  assert.deepEqual(names, ["actor.central", "actor.prediction", "actor.truth-bound", "substrate.silicon"])
})

test("binding is validated and rebindable at runtime", () => {
  const bus = createOsBus()
  const actor: Actor = { id: "c", kind: "central", invoke: async () => "ok" }

  assert.equal(bus.bindActor("actor.central", actor), true)
  assert.equal(bus.requirements().length, 3)
  assert.equal(bus.getActor("actor.central")?.id, "c")

  // An invalid actor is refused; the slot stays a hole.
  assert.equal(bus.bindActor("actor.prediction", {} as unknown as Actor), false)
  assert.equal(bus.requirements().length, 3)

  // An unknown slot cannot be bound.
  assert.equal(bus.bind("actor.nope", actor), false)

  bus.unbind("actor.central")
  assert.equal(bus.requirements().length, 4)
})

test("isActor guards the contract; neuronetActor wraps a skill-specialized net", async () => {
  assert.equal(isActor({ id: "x", kind: "central", invoke: () => {} }), true)
  assert.equal(isActor({ id: "x" }), false)
  assert.equal(isActor(null), false)

  const net = { skill: "edge-detect", evaluate: (input: unknown) => `saw:${String(input)}` }
  const actor = neuronetActor("net-1", "prediction", net)
  assert.equal(actor.skill, "edge-detect")
  assert.equal(await actor.invoke(42), "saw:42")
})

test("the kernel runs with every actor slot empty, and never bricks", async () => {
  const kernel = await quietBoot()
  assert.equal(kernel.requirements().length, 4)

  const r = await kernel.step({ type: "key", data: { code: 65 } })
  assert.equal(r.central, null) // no Central AI bound
  assert.equal(r.governor.state, "nominal") // still fully functional
  assert.equal(r.requirements.length, 4)
})

test("binding a Central actor at runtime changes behavior; unbinding restores the hole", async () => {
  const kernel = await quietBoot()
  const central: Actor = { id: "central-1", kind: "central", invoke: async (view) => ({ observed: view }) }

  assert.equal(kernel.bindActor("actor.central", central), true)
  const r = await kernel.step({ type: "key", data: { code: 1 } })
  assert.ok(r.central)
  assert.equal(r.central.id, "central-1")
  assert.equal(r.requirements.length, 3)

  kernel.unbind("actor.central")
  const r2 = await kernel.step({ type: "key", data: { code: 2 } })
  assert.equal(r2.central, null)
  assert.equal(r2.requirements.length, 4)
})

test("the Negotiator emits a base language: canonical, rung-sorted, signed", async () => {
  let log: RawEvent[] = []
  log = await ingestInput(log, { type: "key", data: { code: 1 } })
  const v = await negotiate(
    { claims: [{ field: "summary" }, { field: "chainHead" }, { field: "keyPresses" }], evidence: { rendersToHuman: true } },
    log,
  )
  if (!v.sufficient) throw new Error("expected sufficient")
  // Sorted ground-truth-first: MACHINE (chainHead) → CODE (keyPresses) → INTERFACE (summary).
  assert.deepEqual(v.base.terms.map((t) => t.rung), ["MACHINE", "CODE", "INTERFACE"])
  assert.deepEqual(v.base.terms.map((t) => t.field), ["chainHead", "keyPresses", "summary"])
  assert.equal(v.base.terms.find((t) => t.field === "keyPresses")?.type, "number")
  assert.match(v.base.signature, /^[0-9a-f]{64}$/)
})

import { test } from "node:test"
import assert from "node:assert/strict"

import { appendEvent, verifyChain } from "../lib/integrity/event-log.ts"
import { applyEvent, checksumOf, initialRepresentation, project } from "../lib/integrity/projection.ts"
import { reconcile } from "../lib/integrity/reconciler.ts"
import { ingestInput, ingestWitnesses } from "../lib/integrity/trace.ts"
import { restrictionCount, runFloorProbe } from "../lib/integrity/floor-probe.ts"
import { GENESIS } from "../lib/integrity/hash.ts"
import type { RawEvent, WitnessRecord } from "../lib/integrity/types.ts"

/** Build a small deterministic trace covering every event type. */
async function sampleTrace(): Promise<RawEvent[]> {
  let log: RawEvent[] = []
  log = await ingestInput(log, { type: "pointer", data: { x: 0, y: 0 } })
  log = await ingestInput(log, { type: "pointer", data: { x: 3, y: 4 } }) // distance 5 from prev
  log = await ingestInput(log, { type: "click", data: { x: 10, y: 10 } })
  log = await ingestInput(log, { type: "key", data: { code: 65 } })
  log = await ingestInput(log, { type: "scroll", data: { dy: 120 } })
  const witnesses: WitnessRecord[] = [
    { handle: "a", label: "reachable one", status: "reachable", detail: "ok" },
    { handle: "b", label: "absent one", status: "absent", detail: "ENOENT" },
    { handle: "c", label: "gated one", status: "gated", detail: "SecurityError" },
    { handle: "d", label: "gated two", status: "gated", detail: "denied" },
  ]
  log = await ingestWitnesses(log, witnesses, 42)
  return log
}

test("the chain is contiguous and self-consistent", async () => {
  const log = await sampleTrace()
  assert.equal(log[0].prevHash, GENESIS)
  assert.equal(log[0].seq, 0)
  assert.equal(log.at(-1)?.seq, log.length - 1)
  const chain = await verifyChain(log)
  assert.equal(chain.valid, true)
  assert.equal(chain.brokenAt, null)
})

test("tampering with any past event breaks the chain at that index", async () => {
  const log = await sampleTrace()
  const tampered = log.map((e, i) => (i === 2 ? { ...e, data: { ...e.data, x: 999 } } : e))
  const chain = await verifyChain(tampered)
  assert.equal(chain.valid, false)
  assert.equal(chain.brokenAt, 2)

  const report = await reconcile(project(log), tampered)
  assert.equal(report.chainValid, false)
  assert.ok(report.diffs.some((d) => d.kind === "chain-break"))
})

test("the projection is a faithful deterministic fold", async () => {
  const log = await sampleTrace()
  const rep = project(log)

  assert.equal(rep.countsByType.pointer, 2)
  assert.equal(rep.countsByType.click, 1)
  assert.equal(rep.countsByType.key, 1)
  assert.equal(rep.countsByType.scroll, 1)
  assert.equal(rep.countsByType.witness, 4)

  assert.equal(rep.keyPresses, 1)
  assert.equal(rep.scrolls, 1)
  assert.equal(rep.pointerSamples, 2)
  assert.equal(rep.pointerDistance, 5) // (0,0) -> (3,4)
  assert.deepEqual(rep.bounds, { minX: 0, minY: 0, maxX: 10, maxY: 10 })

  assert.deepEqual(rep.floor, { probes: 4, reachable: 1, absent: 1, gated: 2 })

  // Folding is order-stable and side-effect free: same log, same checksum.
  assert.equal(await checksumOf(rep), await checksumOf(project(log)))
})

test("reconcile agrees when the representation is the honest fold", async () => {
  const log = await sampleTrace()
  const report = await reconcile(project(log), log)
  assert.equal(report.ok, true)
  assert.equal(report.diffs.length, 0)
  assert.equal(report.liveChecksum, report.expectedChecksum)
})

test("reconcile catches a representation that drifts from the trace", async () => {
  const log = await sampleTrace()
  const drifted = project(log)
  drifted.floor.gated = 99 // claim more restrictions than the trace proves
  drifted.keyPresses = 7

  const report = await reconcile(drifted, log)
  assert.equal(report.ok, false)
  assert.notEqual(report.liveChecksum, report.expectedChecksum)

  const gatedDiff = report.diffs.find((d) => d.field === "floor.gated")
  assert.ok(gatedDiff, "the ρ divergence is reported")
  assert.match(gatedDiff.note ?? "", /restriction count/)
  assert.ok(report.diffs.some((d) => d.field === "keyPresses"))
})

test("applyEvent does not mutate its input representation", async () => {
  const base = initialRepresentation()
  const [e] = await (async () => {
    const log = await ingestInput([], { type: "key", data: { code: 1 } })
    return log
  })()
  const next = applyEvent(base, e)
  assert.equal(base.keyPresses, 0, "input untouched")
  assert.equal(next.keyPresses, 1, "output advanced")
  assert.notEqual(base, next)
})

test("restrictionCount counts only gated witnesses", () => {
  const witnesses: WitnessRecord[] = [
    { handle: "a", label: "", status: "reachable", detail: "" },
    { handle: "b", label: "", status: "gated", detail: "" },
    { handle: "c", label: "", status: "gated", detail: "" },
    { handle: "d", label: "", status: "absent", detail: "" },
  ]
  assert.equal(restrictionCount(witnesses), 2)
})

test("the real floor probe runs against this runtime and never throws", async () => {
  const witnesses = await runFloorProbe()
  assert.ok(witnesses.length > 0)
  for (const w of witnesses) {
    assert.ok(["reachable", "absent", "gated"].includes(w.status), `classified status for ${w.handle}`)
  }
  // Folding real witnesses into a trace reconciles with itself.
  const log = await ingestWitnesses([], witnesses)
  const report = await reconcile(project(log), log)
  assert.equal(report.ok, true)
})

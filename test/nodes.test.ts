import { test } from "node:test"
import assert from "node:assert/strict"

import { decouple } from "../lib/nodes/isf003.ts"
import { PROXIES_REJECTED, constrain } from "../lib/nodes/isf001.ts"
import { trace } from "../lib/nodes/isf004.ts"
import { correct, guardSource } from "../lib/nodes/isf002.ts"
import { reflect } from "../lib/nodes/isf005.ts"
import { accountFor } from "../lib/nodes/layer.ts"
import { GAP_REGISTRY, deriveGaps } from "../lib/nodes/gaps.ts"
import type { AuditGap, NodeContext } from "../lib/nodes/types.ts"
import type { AuditRecord } from "../lib/initiator/audit.ts"
import { Initiator } from "../lib/initiator/initiator.ts"
import { memoryStore } from "../lib/integrity/persistence.ts"
import { initialRepresentation } from "../lib/integrity/projection.ts"

const quietBoot = () => Initiator.boot({ store: memoryStore(), probe: null })

function gap(id: string): AuditGap {
  const def = GAP_REGISTRY.find((g) => g.id === id)
  if (!def) throw new Error(`no gap ${id}`)
  const { present: _present, ...rest } = def
  return rest
}

function fakeAudit(durations: number[]): AuditRecord[] {
  return durations.map((d, i) => ({
    tick: i + 1,
    fn: i === 0 ? "boot" : "step",
    startedAt: 0,
    durationMs: d,
    ok: true,
    digest: "d",
    prevHash: "p",
    hash: "h",
  }))
}

function ctx(over: Partial<NodeContext> & { durations?: number[] } = {}): NodeContext {
  const { durations = [1, 1, 1, 1, 1], ...rest } = over
  return { modules: [], rep: initialRepresentation(), audit: fakeAudit(durations), isolations: [], auditPersisted: false, ...rest }
}

test("ISF_003 decouples a gap into five typed variables and nothing else", () => {
  const out = decouple(gap("audit-unpersisted"))
  assert.deepEqual(Object.keys(out.matrix).sort(), ["independence", "invariant", "observed", "observer", "persistence"])
  assert.equal(out.matrix.persistence, "absent")
  assert.ok(out.detokenized.every((t) => /^[a-z]+=(present|absent)$/.test(t)), "no prose survives")
})

test("ISF_001 denies authorization without observation + invariant, and rejects proxy evidence", () => {
  const physical = gap("physical-telemetry-absent")
  const c1 = constrain(physical, decouple(physical))
  assert.equal(c1.authorized, false) // not observable in this substrate
  assert.equal(c1.entropyDelta, 0.4) // observed + independence absent
  assert.deepEqual(c1.proxyRejected, [...PROXIES_REJECTED])
  assert.ok(c1.proxyRejected.includes("tests-passed"))

  const twins = gap("single-author-twins")
  const c2 = constrain(twins, decouple(twins))
  assert.equal(c2.authorized, true) // observed and bound by an invariant; only independence is missing
  assert.equal(c2.entropyDelta, 0.2)
})

test("ISF_004 ranks strain by the pillars resting on a gap", () => {
  assert.equal(trace(gap("single-author-twins")).strainIndex, 11) // MACHINE+CODE+INTERFACE+AUDIT × 1
  assert.equal(trace(gap("actor-output-unverified")).strainIndex, 0) // inert: nothing rests on it
  const physical = trace(gap("physical-telemetry-absent"))
  assert.equal(physical.strainIndex, 1)
  assert.equal(physical.horizontal, true)
  assert.equal(trace(gap("single-author-twins")).horizontal, false)
})

test("ISF_002 declares absent telemetry, baselines on real timings, records (never enforces) latency anomalies", () => {
  const quiet = correct(ctx({ durations: [1, 1, 1, 1, 1] }))
  assert.deepEqual(quiet.telemetry.absent, ["power-rail", "thermal", "bus-density"])
  assert.equal(quiet.baselineMs, 1)
  assert.equal(quiet.anomaly, false)
  assert.equal(quiet.commands.length, 0)

  const spiky = correct(ctx({ durations: [1, 1, 1, 1, 50] }))
  assert.equal(spiky.anomaly, true)
  const cmd = spiky.commands.find((c) => c.kind === "isolate-function")
  assert.ok(cmd)
  assert.equal(cmd.applied, false) // a timing proxy is recorded, never enforced
  assert.equal(cmd.target, "step")
})

test("guardSource turns a throw or a hang into an outcome, never a crash", async () => {
  const good = { id: "g", kind: "central" as const, invoke: async () => 42 }
  const bad = {
    id: "b",
    kind: "central" as const,
    invoke: async () => {
      throw new Error("model crashed")
    },
  }
  const hang = { id: "h", kind: "central" as const, invoke: () => new Promise<unknown>(() => {}) }

  assert.deepEqual(await guardSource(good, null), { ok: true, output: 42 })
  const b = await guardSource(bad, null)
  assert.equal(b.ok, false)
  if (!b.ok) assert.match(b.error, /model crashed/)
  const h = await guardSource(hang, null, 20)
  assert.equal(h.ok, false)
  if (!h.ok) assert.match(h.error, /TimeoutError/)
})

test("ISF_005 proceeds on physical anchors, recalibrates on provenance, interrupts on vocabulary", () => {
  const physical = gap("physical-telemetry-absent")
  assert.equal(reflect(physical, decouple(physical), constrain(physical, decouple(physical))).signal, "proceed")

  const twins = gap("single-author-twins")
  const r = reflect(twins, decouple(twins), constrain(twins, decouple(twins)))
  assert.equal(r.signal, "recalibrate")
  assert.equal(r.anchored, false)
  assert.match(r.reason, /independent reviewer/)

  const words: AuditGap = { ...physical, id: "just-words", anchor: null }
  const w = reflect(words, decouple(words), constrain(words, decouple(words)))
  assert.equal(w.signal, "interrupt")
  assert.equal(w.loopDetected, true)
  assert.equal(accountFor(ctx(), [words]).valid, false) // the accounting rejects itself
})

test("deriveGaps reads live state: binding the silicon slot closes the physical gap", () => {
  const unbound = deriveGaps(ctx()).map((g) => g.id)
  assert.ok(unbound.includes("physical-telemetry-absent"))
  const bound = deriveGaps(
    ctx({ modules: [{ name: "substrate.silicon", rung: "VOLTAGE", bound: true, provides: ["start", "run"] }] }),
  ).map((g) => g.id)
  assert.ok(!bound.includes("physical-telemetry-absent"))
})

test("the Initiator accounts for its own audit gaps through the node layer — audited", async () => {
  const os = await quietBoot()
  const before = os.clock()
  const acct = await os.account()
  assert.equal(os.clock(), before + 1) // account() is itself logged and clocked
  assert.equal(os.auditLog().at(-1)?.fn, "account")

  const ids = acct.gaps.map((g) => g.gap.id)
  for (const expected of [
    "physical-telemetry-absent",
    "no-real-gated-witness",
    "audit-unpersisted",
    "single-author-twins",
    "boot-single-tick",
    "reads-unaudited",
  ]) {
    assert.ok(ids.includes(expected), `missing ${expected}`)
  }
  assert.ok(!ids.includes("actor-output-unverified")) // no actor bound

  assert.equal(acct.chokePoints[0], "single-author-twins") // close this one first
  assert.equal(acct.signal, "recalibrate") // provenance cannot be relabeled away
  assert.equal(acct.valid, true)
  assert.ok(acct.correction.telemetry.absent.includes("power-rail"))
  assert.ok(acct.totalEntropy > 0)
})

test("ISF_002 isolates a failing actor at once — the system continues, nothing bricks", async () => {
  const os = await quietBoot()
  await os.bindActor("actor.central", {
    id: "broken-net",
    kind: "central",
    invoke: async () => {
      throw new Error("model crashed")
    },
  })
  assert.equal(os.requirements().length, 3)

  const r = await os.step({ type: "key", data: { code: 1 } })
  assert.ok(r.central?.isolated, "the failing source was isolated")
  assert.equal(r.central?.isolated?.applied, true)
  assert.match(r.central?.isolated?.reason ?? "", /model crashed/)
  assert.equal(r.governor.state, "nominal") // an optional module failing never locks down
  assert.equal(r.requirements.length, 4) // the slot is a defined hole again
  assert.equal(os.isolationLog().length, 1)

  const acct = await os.account()
  assert.ok(acct.correction.commands.some((c) => c.kind === "isolate-source" && c.target === "actor.central"))
})

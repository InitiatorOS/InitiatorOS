/**
 * Boot the OS and drive it through its lifecycle:
 *
 *   node --experimental-strip-types os-demo.ts
 *
 * The Initiator is both bootloader and kernel: it boots (attest + floor map),
 * supervises every transition through Twins/Mayor/Governor, answers Negotiator
 * queries, and routes every function through one clocked, hash-chained audit.
 * Drift trips the Governor; the audit log at the end is the zero-trust record.
 */
import { Initiator } from "./lib/initiator/initiator.ts"
import { project } from "./lib/integrity/projection.ts"
import { neuronetActor } from "./lib/modules/actor.ts"
import type { RawInput } from "./lib/integrity/source.ts"

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(24)} ${value}`)
}

async function main(): Promise<void> {
  console.log("\n== BOOT: Initiator (bootloader + kernel) ==")
  const kernel = await Initiator.boot() // default: real floor probe at startup
  const b = kernel.bootReport
  line("chain valid / sealed", `${b.chainValid} / ${b.sealed}`)
  line("head", b.head.slice(0, 16) + "…")
  line("floor at boot", `${b.floor.probes} probes, ρ=${b.floor.gated}`)
  line("governor", kernel.state.governor)

  console.log("\n== KERNEL: step transitions ==")
  const inputs: RawInput[] = [
    { type: "pointer", data: { x: 0, y: 0 } },
    { type: "pointer", data: { x: 30, y: 40 } },
    { type: "click", data: { x: 30, y: 40 } },
    { type: "key", data: { code: 13 } },
  ]
  for (const input of inputs) {
    const r = await kernel.step(input)
    line(`step ${input.type}`, `parity=${r.twins.parity} mayor=${r.mayor.halt ? "HALT" : "ok"} gov=${r.governor.state} door=${r.door.admitted ? "open" : "sealed"}`)
  }

  console.log("\n== RUNTIME: query through the Negotiator ==")
  const q = await kernel.query({ declaredRung: "INTERFACE", claims: [{ field: "summary" }], evidence: { rendersToHuman: true } })
  if (q.sufficient) line("summary", q.representation.summary)

  console.log("\n== INJECT DRIFT: upper layer lies about the trace ==")
  const lying = project(kernel.snapshot())
  lying.floor.gated += 7 // claim restrictions never witnessed
  const sup = await kernel.supervise(lying)
  line("twins parity", String(sup.twins.parity))
  line("mayor", sup.mayor.reason)
  line("governor", `${sup.governor.state}  (${sup.governor.reasons.join("; ")})`)
  line("door", sup.door.note)

  console.log("\n== QUERY WHILE LOCKED ==")
  const locked = await kernel.query({ claims: [{ field: "summary" }], evidence: { rendersToHuman: true } })
  line("sufficient", String(locked.sufficient))
  if (!locked.sufficient && "locked" in locked) line("refused", locked.reasons[0])

  console.log("\n== RESET + RE-QUERY ==")
  await kernel.resetGovernor()
  const after = await kernel.query({ claims: [{ field: "eventCount" }], evidence: { citesTraceHash: "x" } })
  line("governor", kernel.state.governor)
  if (after.sufficient) line("eventCount", after.representation.eventCount)

  console.log("\n== MODULES: the system knows what is missing ==")
  for (const req of kernel.requirements()) line(`unbound: ${req.name}`, `needs [${req.provides.join(", ")}]`)

  console.log("\n== SELF-MODIFY: bind a neuronet as the Central AI ==")
  const net = { skill: "door-watch", evaluate: (view: unknown) => ({ note: "neuronet observed metadata", view }) }
  await kernel.bindActor("actor.central", neuronetActor("central-net", "central", net))
  const stepped = await kernel.step({ type: "pointer", data: { x: 1, y: 1 } })
  line("central now", stepped.central ? `bound (${stepped.central.id})` : "unbound")
  line("remaining holes", String(stepped.requirements.length))

  console.log("\n== BASE LANGUAGE: the Negotiator's canonical IR ==")
  const q2 = await kernel.query({
    claims: [{ field: "summary" }, { field: "chainHead" }, { field: "eventCount" }],
    evidence: { rendersToHuman: true },
  })
  if (q2.sufficient) {
    line("base signature", q2.base.signature.slice(0, 16) + "…")
    for (const t of q2.base.terms) line(`  ${t.rung}`, `${t.field} : ${t.type}`)
  }

  console.log("\n== AUDIT: every function, logged and clocked ==")
  const audited = await kernel.verifyAudit()
  line("clock (functions run)", String(kernel.clock()))
  line("audit chain valid", String(audited.valid))
  for (const rec of kernel.auditLog()) {
    line(`tick ${rec.tick}: ${rec.fn}`, `${rec.durationMs}ms  ok=${rec.ok}  digest=${rec.digest.slice(0, 12)}…`)
  }
  console.log("")
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

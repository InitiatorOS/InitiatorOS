/**
 * Boot the OS and drive it through its lifecycle:
 *
 *   node --experimental-strip-types os-demo.ts
 *
 * boot (Initiator attestation + floor map) → step transitions through the
 * Twins/Mayor/Governor kernel → query through the Negotiator → inject drift and
 * watch the Governor trip, seal the Door, and refuse queries until reset.
 */
import { Kernel } from "./lib/kernel/kernel.ts"
import { project } from "./lib/integrity/projection.ts"
import type { RawInput } from "./lib/integrity/source.ts"

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(24)} ${value}`)
}

async function main(): Promise<void> {
  console.log("\n== BOOT: Initiator ==")
  const kernel = await Kernel.boot() // default: real floor probe at startup
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
  kernel.resetGovernor()
  const after = await kernel.query({ claims: [{ field: "eventCount" }], evidence: { citesTraceHash: "x" } })
  line("governor", kernel.state.governor)
  if (after.sufficient) line("eventCount", after.representation.eventCount)
  console.log("")
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

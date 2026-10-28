/**
 * A runnable proof of the integrity core against this exact runtime.
 *
 *   node --experimental-strip-types demo.ts
 *
 * It builds a trace from a few synthetic interactions plus a *real* floor probe,
 * reconciles it (clean), then injects out-of-band drift and reconciles again
 * (caught) — the whole claim of the system, demonstrated end to end.
 */
import { project } from "./lib/integrity/projection.ts"
import { reconcile } from "./lib/integrity/reconciler.ts"
import { ingestInput, ingestWitnesses } from "./lib/integrity/trace.ts"
import { restrictionCount, runFloorProbe } from "./lib/integrity/floor-probe.ts"
import type { RawEvent } from "./lib/integrity/types.ts"

function line(label: string, value: string): void {
  console.log(`  ${label.padEnd(22)} ${value}`)
}

async function main(): Promise<void> {
  let log: RawEvent[] = []
  log = await ingestInput(log, { type: "pointer", data: { x: 0, y: 0 } })
  log = await ingestInput(log, { type: "pointer", data: { x: 30, y: 40 } })
  log = await ingestInput(log, { type: "click", data: { x: 30, y: 40 } })
  log = await ingestInput(log, { type: "key", data: { code: 13 } })

  console.log("\n== floor probe (real, this runtime) ==")
  const witnesses = await runFloorProbe()
  for (const w of witnesses) {
    const mark = w.status === "gated" ? "GATED  " : w.status === "absent" ? "absent " : "reach. "
    line(`[${mark}] ${w.handle}`, w.detail)
  }
  log = await ingestWitnesses(log, witnesses)

  const rep = project(log)
  console.log("\n== representation (folded from trace) ==")
  line("events in trace", String(log.length))
  line("pointer distance", rep.pointerDistance.toFixed(2))
  line("floor probes", String(rep.floor.probes))
  line("ρ (gated / proven)", `${rep.floor.gated}  [restrictionCount=${restrictionCount(witnesses)}]`)

  console.log("\n== reconcile: honest representation ==")
  const clean = await reconcile(rep, log)
  line("ok", String(clean.ok))
  line("chain valid", String(clean.chainValid))
  line("checksum", clean.liveChecksum.slice(0, 16) + "…")

  console.log("\n== reconcile: after out-of-band drift ==")
  const drifted = project(log)
  drifted.floor.gated += 5 // claim restrictions the trace does not prove
  const dirty = await reconcile(drifted, log)
  line("ok", String(dirty.ok))
  for (const d of dirty.diffs) {
    line(`drift: ${d.field}`, `live=${d.live} expected=${d.expected}${d.note ? `  (${d.note})` : ""}`)
  }
  console.log("")
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

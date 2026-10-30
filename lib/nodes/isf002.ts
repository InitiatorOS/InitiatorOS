/**
 * ISF_002 — Thermodynamic State-Feedback and Autonomous Correction Circuit.
 *
 * Measures computational work and corrects in a closed loop without a human in
 * it. What this substrate can measure is declared present; what it cannot
 * (power rails, thermal, bus density) is declared absent — never faked.
 */
import type { Isf002Out, IsolationCommand, NodeContext } from "./types.ts"
import type { Actor } from "../modules/actor.ts"

export const ISF_002 = {
  id: "ISF_002",
  designation: "Thermodynamic State-Feedback and Autonomous Correction Circuit",
} as const

export const TELEMETRY_PRESENT = ["audit.durationMs", "audit.tick"] as const
export const TELEMETRY_ABSENT = ["power-rail", "thermal", "bus-density"] as const

export const ANOMALY_RATIO = 8
export const MIN_SAMPLES = 5

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * The closed loop over the whole runtime. Baseline is the median function
 * duration; deviation is the latest against it. Isolations the Initiator has
 * already enforced are reported. A latency anomaly is recorded as a command
 * that is deliberately NOT enforced: timing in a garbage-collected runtime is a
 * software-layer proxy (ISF_001), not a physical measurement, and acting on it
 * would lock the system down on a GC pause.
 */
export function correct(ctx: NodeContext): Isf002Out {
  const durations = ctx.audit.map((r) => r.durationMs)
  const baselineMs = Number(median(durations).toFixed(3))
  const latest = ctx.audit[ctx.audit.length - 1]
  const latestMs = latest ? latest.durationMs : 0
  const deviation = baselineMs > 0 ? Number((latestMs / baselineMs).toFixed(2)) : 0
  const anomaly = durations.length >= MIN_SAMPLES && deviation > ANOMALY_RATIO

  const commands: IsolationCommand[] = [...ctx.isolations]
  if (anomaly && latest) {
    commands.push({
      kind: "isolate-function",
      target: latest.fn,
      applied: false,
      at: Date.now(),
      reason: `latency ${latestMs}ms is ${deviation}× the ${baselineMs}ms baseline; recorded, not enforced — timing in a garbage-collected runtime is a software-layer proxy, not a physical measurement`,
    })
  }

  return {
    nodeId: "ISF_002",
    telemetry: { present: [...TELEMETRY_PRESENT], absent: [...TELEMETRY_ABSENT] },
    baselineMs,
    latestMs,
    deviation,
    anomaly,
    commands,
  }
}

export type GuardOutcome = { ok: true; output: unknown } | { ok: false; error: string }

/** Invoke an optional source so that a throw or a hang becomes an outcome, never a crash. */
export async function guardSource(actor: Actor, input: unknown, timeoutMs = 1000): Promise<GuardOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const output = await Promise.race([
      Promise.resolve().then(() => actor.invoke(input)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("TimeoutError: source did not respond")), timeoutMs)
      }),
    ])
    return { ok: true, output }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** The hard-isolation command for a failing source. The Initiator enforces it at once. */
export function isolateSource(target: string, actorId: string, reason: string): IsolationCommand {
  return { kind: "isolate-source", target, applied: true, at: Date.now(), reason: `${actorId}: ${reason}` }
}

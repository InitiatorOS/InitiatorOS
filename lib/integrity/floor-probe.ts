/**
 * The floor probe interrogates real runtime telemetry surfaces and classifies
 * each into the reachable / absent / gated trichotomy — the operational core of
 * the framework.
 *
 * The distinction that matters:
 *   - absent  = the handle does not exist (ENOENT). The floor is merely finite
 *               here. This is NOT a restriction.
 *   - gated   = the handle exists but returns a typed denial (SecurityError,
 *               'denied', an EIO/EPERM-equivalent). An operator actively occludes
 *               the state. This IS a restriction, and the <handle, denial> pair
 *               is a witness W(s): a reachable artifact that proves an
 *               unreachable state exists — without ever reading its value.
 *
 * This is the browser `FloorProbe`. It runs for real against whatever runtime it
 * loads in: in a sandboxed cross-origin iframe many capabilities are gated by
 * Permissions-Policy, so the gated witnesses are genuine, not simulated; under
 * Node most browser-only handles report `absent`, which is equally honest. A
 * host build provides a different `FloorProbe` over the same interface.
 */
import type { ProbeStatus, WitnessRecord } from "./types.ts"
import type { FloorProbe } from "./source.ts"

type ProbeResult = { status: ProbeStatus; detail: string }

interface Probe {
  handle: string
  label: string
  run: () => Promise<ProbeResult> | ProbeResult
}

/** Bound any async probe so a hung handle degrades to a gated witness instead of blocking. */
function withTimeout(p: Promise<ProbeResult>, ms = 1500): Promise<ProbeResult> {
  return Promise.race([
    p,
    new Promise<ProbeResult>((resolve) =>
      setTimeout(() => resolve({ status: "gated", detail: "TimeoutError: handle did not resolve" }), ms),
    ),
  ])
}

const reachable = (detail: string): ProbeResult => ({ status: "reachable", detail })
const absent = (detail: string): ProbeResult => ({ status: "absent", detail })
const gated = (detail: string): ProbeResult => ({ status: "gated", detail })

/** Turn a thrown value into a typed-denial string (its error name is the denial code). */
function denialOf(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message.slice(0, 80)}`
  return String(err).slice(0, 80)
}

/* Probes reach for non-standard / host globals, so casts to `any` are deliberate. */
type Any = any // eslint-disable-line @typescript-eslint/no-explicit-any

const PROBES: Probe[] = [
  {
    handle: "navigator.hardwareConcurrency",
    label: "logical cores",
    run: () => {
      const nav = (globalThis as Any).navigator
      const v = nav?.hardwareConcurrency
      return typeof v === "number" ? reachable(`${v} cores`) : absent("property undefined")
    },
  },
  {
    handle: "navigator.deviceMemory",
    label: "device memory",
    run: () => {
      const v = (globalThis as Any).navigator?.deviceMemory
      return typeof v === "number" ? reachable(`${v} GB (quantized)`) : absent("not exposed by this engine")
    },
  },
  {
    handle: "performance.memory",
    label: "JS heap counters",
    run: () => {
      const m = (globalThis as Any).performance?.memory
      if (!m) return absent("non-standard; not present in this engine")
      return reachable(`limit ${Math.round(m.jsHeapSizeLimit / 1048576)} MB`)
    },
  },
  {
    handle: "navigator.gpu",
    label: "WebGPU adapter",
    run: async () => {
      const gpu = (globalThis as Any).navigator?.gpu
      if (!gpu) return absent("navigator.gpu undefined")
      try {
        return await withTimeout(
          gpu
            .requestAdapter()
            .then((a: unknown) => (a ? reachable("adapter granted") : gated("requestAdapter -> null (no adapter released)"))),
        )
      } catch (err) {
        return gated(denialOf(err))
      }
    },
  },
  {
    handle: "new Accelerometer()",
    label: "motion sensor",
    run: () => {
      const Ctor = (globalThis as Any).Accelerometer
      if (!Ctor) return absent("Accelerometer constructor undefined")
      try {
        // Construction throws synchronously when blocked by Permissions-Policy.
        new Ctor({ frequency: 1 })
        return reachable("sensor constructed")
      } catch (err) {
        return gated(denialOf(err))
      }
    },
  },
  {
    handle: "navigator.permissions{geolocation}",
    label: "geolocation",
    run: async () => {
      const perms = (globalThis as Any).navigator?.permissions
      if (!perms?.query) return absent("Permissions API undefined")
      try {
        return await withTimeout(
          perms
            .query({ name: "geolocation" })
            .then((s: Any) =>
              s.state === "denied" ? gated("permission state: denied") : reachable(`permission state: ${s.state}`),
            ),
        )
      } catch (err) {
        return gated(denialOf(err))
      }
    },
  },
  {
    handle: "navigator.permissions{camera}",
    label: "camera",
    run: async () => {
      const perms = (globalThis as Any).navigator?.permissions
      if (!perms?.query) return absent("Permissions API undefined")
      try {
        return await withTimeout(
          perms
            .query({ name: "camera" })
            .then((s: Any) =>
              s.state === "denied" ? gated("permission state: denied") : reachable(`permission state: ${s.state}`),
            ),
        )
      } catch (err) {
        // Some engines reject 'camera' as an unknown descriptor — that's a typed denial.
        return gated(denialOf(err))
      }
    },
  },
  {
    handle: "navigator.storage.estimate()",
    label: "storage quota",
    run: async () => {
      const storage = (globalThis as Any).navigator?.storage
      if (!storage?.estimate) return absent("StorageManager undefined")
      try {
        return await withTimeout(
          storage.estimate().then((e: Any) => reachable(`quota ~${Math.round((e.quota ?? 0) / 1048576)} MB`)),
        )
      } catch (err) {
        return gated(denialOf(err))
      }
    },
  },
  {
    handle: "crypto.subtle",
    label: "web crypto",
    run: () => {
      const s = (globalThis as Any).crypto?.subtle
      return s ? reachable("SubtleCrypto present (secure context)") : gated("subtle undefined (insecure context)")
    },
  },
]

/**
 * Run the full probe battery against the live runtime and return the classified
 * witnesses. Never throws and never freezes: a probe that would hang degrades to
 * a gated witness (record-the-scar-and-continue), because hitting a boundary is
 * the probe working correctly, not a failure.
 */
export async function runFloorProbe(): Promise<WitnessRecord[]> {
  const out: WitnessRecord[] = []
  for (const probe of PROBES) {
    let result: ProbeResult
    try {
      result = await probe.run()
    } catch (err) {
      result = gated(denialOf(err))
    }
    out.push({ handle: probe.handle, label: probe.label, status: result.status, detail: result.detail })
  }
  return out
}

/** The browser floor-probe, packaged as a `FloorProbe` for the substrate seam. */
export const browserFloorProbe: FloorProbe = {
  name: "browser",
  run: runFloorProbe,
}

/** ρ(E_n): the number of proven restrictions in a witness batch. */
export function restrictionCount(witnesses: readonly WitnessRecord[]): number {
  return witnesses.filter((w) => w.status === "gated").length
}

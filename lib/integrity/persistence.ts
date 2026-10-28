/**
 * Trace storage — a swappable variable, per the framework.
 *
 * The core does not care *where* the trace lives. Persistence is an interface
 * (`TraceStore`) with interchangeable backends. The default is in-memory; a
 * browser build swaps in `localStorageStore`; a host build swaps in a file- or
 * device-backed store. `loadLog` / `saveLog` / `clearLog` keep the original flat
 * API and route to whichever store is currently configured.
 */
import type { RawEvent } from "./types.ts"

export interface TraceStore {
  readonly name: string
  load(): Promise<RawEvent[]>
  save(log: readonly RawEvent[]): Promise<void>
  clear(): Promise<void>
}

/** In-memory store. Survives nothing beyond the process — the portable default. */
export function memoryStore(seed: RawEvent[] = []): TraceStore {
  let state: RawEvent[] = [...seed]
  return {
    name: "memory",
    async load() {
      return [...state]
    },
    async save(log) {
      state = [...log]
    },
    async clear() {
      state = []
    },
  }
}

/**
 * Browser `localStorage` store. Guarded: if `localStorage` is unavailable (SSR,
 * Node, a privacy-locked context) every method degrades to a no-op / empty
 * rather than throwing, so the same code path is safe everywhere.
 */
export function localStorageStore(key = "initiatoros.trace"): TraceStore {
  const ls = (): Storage | null => {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null
    } catch {
      return null
    }
  }
  return {
    name: "localStorage",
    async load() {
      const raw = ls()?.getItem(key)
      if (!raw) return []
      try {
        return JSON.parse(raw) as RawEvent[]
      } catch {
        return []
      }
    },
    async save(log) {
      try {
        ls()?.setItem(key, JSON.stringify(log))
      } catch {
        /* quota / unavailable — record-and-continue */
      }
    },
    async clear() {
      try {
        ls()?.removeItem(key)
      } catch {
        /* ignore */
      }
    },
  }
}

let active: TraceStore = memoryStore()

/** Point the flat `loadLog`/`saveLog`/`clearLog` API at a different backend. */
export function configureStore(store: TraceStore): void {
  active = store
}

/** The store currently backing the flat API. */
export function currentStore(): TraceStore {
  return active
}

export const loadLog = (): Promise<RawEvent[]> => active.load()
export const saveLog = (log: readonly RawEvent[]): Promise<void> => active.save(log)
export const clearLog = (): Promise<void> => active.clear()

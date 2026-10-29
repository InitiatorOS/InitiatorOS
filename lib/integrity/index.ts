/**
 * Public API of the integrity core.
 *
 * The whole surface is substrate-agnostic: nothing here imports a browser, a
 * device, or a kernel. Runtime-specific pieces (the browser floor-probe, a
 * localStorage trace store) implement the `FloorProbe` / `TraceStore` seams and
 * are swapped in by the host build.
 */
export type {
  Divergence,
  DivergenceKind,
  EventType,
  ProbeStatus,
  RawEvent,
  ReconcileReport,
  Representation,
  WitnessRecord,
} from "./types.ts"

export { GENESIS, canonicalize, sha256Hex } from "./hash.ts"
export { appendEvent, hashEvent, verifyChain } from "./event-log.ts"
export { applyEvent, checksumOf, initialRepresentation, project } from "./projection.ts"
export { reconcile } from "./reconciler.ts"
export { ingestInput, ingestWitnesses } from "./trace.ts"
export {
  type TraceStore,
  clearLog,
  configureStore,
  currentStore,
  loadLog,
  localStorageStore,
  memoryStore,
  saveLog,
} from "./persistence.ts"
export { type EventSource, type FloorProbe, type RawInput } from "./source.ts"
export { browserFloorProbe, restrictionCount, runFloorProbe } from "./floor-probe.ts"
export { DEEPEST_FORMULABLE, FIELD_REGISTRY, type Rung, RUNGS, isDeeper, rungIndex } from "./layers.ts"
export {
  type Claim,
  type InsufficientVerdict,
  type NegotiationRequest,
  type NegotiationVerdict,
  type RequestEvidence,
  type Requirement,
  type SufficientVerdict,
  negotiate,
} from "./negotiator.ts"
export { type BaseForm, type BaseTerm, normalize } from "./normalize.ts"

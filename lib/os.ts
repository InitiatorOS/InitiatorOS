/**
 * The whole-OS public API. The Initiator is both bootloader and kernel: it boots
 * (attest + seal), runs the Twins/Mayor/Governor supervision over the
 * hashed-event runtime (projection + Negotiator + floor probe), and routes every
 * function through one clocked, hash-chained audit — the zero-trust record.
 */
export * from "./integrity/index.ts"

export { boot, type BootOptions, type BootReport, type BootResult } from "./initiator/boot.ts"
export { AuditLog, type AuditEntry, type AuditRecord } from "./initiator/audit.ts"
export {
  Initiator,
  type InitiatorQueryResult,
  type InitiatorState,
  type LockedVerdict,
  type SupervisoryResult,
} from "./initiator/initiator.ts"
export { twins, type TwinsResult } from "./kernel/twins.ts"
export { mayor, type MayorVerdict } from "./kernel/mayor.ts"
export { Governor, type GovernorDecision, type GovernorState } from "./kernel/governor.ts"
export { observe, type DoorObservation, type DoorView } from "./central/door.ts"

// The self-building module substrate: typed slots, replaceable AI actors, the bus.
export { Slot, type Contract, type SlotRequirement, type SlotStatus } from "./modules/slot.ts"
export { type Actor, type ActorKind, type Neuronet, isActor, neuronetActor } from "./modules/actor.ts"
export { ModuleBus, createOsBus } from "./modules/bus.ts"

// The node layer (ISF_001–005): accounting for what cannot be properly audited.
export * from "./nodes/types.ts"
export { GAP_REGISTRY, deriveGaps } from "./nodes/gaps.ts"
export { ISF_001, PROXIES_REJECTED, constrain } from "./nodes/isf001.ts"
export { ISF_002, TELEMETRY_ABSENT, TELEMETRY_PRESENT, correct, guardSource, isolateSource } from "./nodes/isf002.ts"
export { ISF_003, decouple } from "./nodes/isf003.ts"
export { ISF_004, PILLAR_WEIGHT, trace } from "./nodes/isf004.ts"
export { ISF_005, reflect } from "./nodes/isf005.ts"
export { NODE_LAYER, accountFor } from "./nodes/layer.ts"

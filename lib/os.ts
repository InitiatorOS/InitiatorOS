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

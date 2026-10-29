/**
 * The whole-OS public API: boot + kernel + central door, over the integrity
 * runtime. The lifecycle is boot (Initiator) → kernel (Twins/Mayor/Governor) →
 * runtime (hashed-event trace + projection + Negotiator + floor probe).
 */
export * from "./integrity/index.ts"

export { boot, type BootOptions, type BootReport, type BootResult } from "./boot/initiator.ts"
export {
  Kernel,
  type KernelQueryResult,
  type KernelState,
  type LockedVerdict,
  type SupervisoryResult,
} from "./kernel/kernel.ts"
export { twins, type TwinsResult } from "./kernel/twins.ts"
export { mayor, type MayorVerdict } from "./kernel/mayor.ts"
export { Governor, type GovernorDecision, type GovernorState } from "./kernel/governor.ts"
export { observe, type DoorObservation, type DoorView } from "./central/door.ts"

// The self-building module substrate: typed slots, replaceable AI actors, the bus.
export { Slot, type Contract, type SlotRequirement, type SlotStatus } from "./modules/slot.ts"
export { type Actor, type ActorKind, type Neuronet, isActor, neuronetActor } from "./modules/actor.ts"
export { ModuleBus, createOsBus } from "./modules/bus.ts"

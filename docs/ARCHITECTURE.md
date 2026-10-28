# Architecture — framework vs. implementation

This document maps the framework you specified onto the code in this repository,
and is deliberately honest about the boundary between three categories:

- **Implemented** — real, tested code in `lib/integrity/`.
- **Seam** — an interface is defined and one adapter exists; a second adapter
  (e.g. a host/hardware one) plugs in without changing the core.
- **Design-level** — described in the framework but not buildable as stated from
  where this code runs, or resting on an assumption that needs to be resolved
  first. These are **not** stubbed out as if they worked; faking them would
  violate the framework's own rules (ISF_005: don't patch a logic gap with new
  vocabulary; ISF_002: no hallucinated results).

The point of the core is that a representation must answer to a physical record.
Applying that same standard to the *framework itself* is why the table below
refuses to pretend a layer exists when it doesn't.

## The three-layer substrate (your general framework)

You described the real stack as: voltage (high/low) → machine-readable
abstraction → human-readable code compiled back to bits → the UI representation,
with each layer often not declaring *which* layer it is — which is what the
Negotiator is for.

This code models the **top three rungs** faithfully and in a substrate-agnostic
way:

| Rung in your model              | Here                                              | Status |
| ------------------------------- | ------------------------------------------------- | ------ |
| physical state transition       | `RawEvent` in the hash-chained trace              | Implemented (as the *record* of a transition; see note) |
| machine-readable abstraction    | `Representation` (the deterministic fold)         | Implemented |
| human-readable / UI             | consumer of `Representation` + `ReconcileReport`  | Seam (front end swaps in) |
| "which layer is asking?" gate   | `reconcile` + the `FloorProbe` trichotomy         | Implemented (software gate); full Negotiator is Design-level |

**Note on rung 1.** The trace records transitions handed to it by an
`EventSource` / `FloorProbe`. Capturing the *actual silicon* transition (the
voltage edge itself) is below any JavaScript runtime and is Design-level here —
it requires a host/hardware adapter (see "Initiator", below).

## Named components

| Component | Framework role | Where / status |
| --------- | -------------- | -------------- |
| **Reconciler** | Algorithmic state-comparison engine | `reconciler.ts` — **Implemented**. Re-folds the trace, diffs every field (including ρ), re-verifies the chain. |
| **Initiator** (as a data structure) | Immutable append-only ledger of state transitions | `event-log.ts` + `hash.ts` — **Implemented**. Tamper-evident hash chain; `verifyChain` pinpoints any break. |
| **Initiator** (as "Ring -1 / VMX-root substrate") | Bare-metal capture of memory, registers, interrupts | **Design-level.** Not reachable from a JS runtime. Belongs to a host/hypervisor adapter behind the `EventSource` seam, written in C/Rust/asm — a separate project, not this module. |
| **Negotiator** | Super-compiler / representation gate: asks *which layer* a request comes from and whether the representation along the stack is sufficient | Partially **Implemented** as the reconciliation gate (sufficiency = "does the representation reconcile with the trace?"). The full "classify the requesting layer and negotiate a sufficient representation across rungs" is **Design-level** — see "Open design questions". |
| **Twins** (parity O₁ = O₂) | Dual backend actors; block unless outputs are identical | **Design-level** (software-modelable). A parity gate over two `Representation`-producing engines is implementable honestly as a pure comparison; it is not built yet. |
| **Mayor** | Silicon-only witness; compares Twins' output to raw telemetry | **Design-level.** Depends on a real telemetry source (the hardware adapter). Modelable as a witness that only reads the trace, never the representation. |
| **Governor** | Dual-visibility circuit breaker; lockdown | **Design-level.** A breaker over `ReconcileReport` (trip on `ok === false`) is implementable; the hardware-telemetry half needs the adapter. |
| **Central AI / State Transition Door** | Apex reasoning behind the gate; "synthetic intuition" = adapts weights only from its own telemetry, no raw-data access | **Design-level, with an open question.** The *boundary* (a component that sees only metadata/`ReconcileReport`, never the raw trace) is implementable and useful. The specific "adapts its own weights purely from telemetry it cannot directly read" mechanism is not something this core can implement truthfully; it needs to be pinned to a concrete learning procedure before it is code. |
| **Floor probe** | Reachable / absent / gated classification | `floor-probe.ts` — **Implemented** (browser adapter). ISF_001 boundary classification at the capability level. |

## ISF nodes

| Node | Essence | Status here |
| ---- | ------- | ----------- |
| ISF_001 topological / invariant | collapse illegal states; classify boundaries | **Implemented** at the capability level (floor trichotomy, ρ). Silicon-timing/voltage *authentication* is Design-level and see the caution below. |
| ISF_002 thermodynamic feedback | entropy/thermal anomaly → hard isolation | **Design-level.** Needs real power/thermal telemetry (hardware adapter). The "record-and-continue, never human-speed" posture is honored in code (probes degrade, never block). |
| ISF_003 semantic decoupling | strip tokens → typed boundary state | **Partially implemented in spirit**: inputs are reduced to typed `RawEvent`s with explicit `data`, not free text. Full NL→invariant parsing is Design-level. |
| ISF_004 multi-order causal tracing | trace downstream structural consequences | **Design-level.** |
| ISF_005 metacognitive boundary audit | halt when logic relies on vocabulary substitution | Honored as a **design rule for this document and the code** (no faked layers), not a runtime component. |
| ISF_006 "the Twins" | dual-track cross-check, sealed root | Root-sealing is **Implemented** (append-only chain); dual-track parity is Design-level. |
| ISF_007 State Transition Door | observe metadata only, no raw pointers | **Seam/Design-level.** `ReconcileReport` is exactly a metadata view; wiring a reasoning layer to *only* that is a clean next step. |
| ISF_008 sterile debug firewall | quarantine diagnostic sessions | **Design-level.** |

## One technical caution (stated plainly, per ISF_002)

Two claims in the framework need to be resolved before they become code, because
as written they don't hold:

1. **Power-rail voltage / silicon-timing as un-spoofable authentication**
   (ISF_001 general example). Timing and power profiles are measurable and
   useful as *anomaly* signals, but they are environment-dependent and
   reproducible/replayable enough that treating them as an *un-spoofable
   identity* primitive is unsafe. A hardware root of trust (e.g. a measured-boot
   attestation key) is the sound version of "authenticate the silicon, not a
   software token." Happy to build toward that; I won't ship code that claims
   voltage alone is un-spoofable.

2. **"Synthetic intuition" — an AI that adapts its weights only from telemetry
   it cannot directly read.** The *isolation boundary* is real and buildable
   (let the reasoning layer see only `ReconcileReport`-style metadata). The
   "adapts weights without access to the signal driving the adaptation" part is
   self-contradictory as stated and needs a concrete mechanism (what is the
   training signal, and through what channel) before it can be implemented
   without hand-waving.

Neither caution blocks the core above — the trace, projection, reconciler, and
floor probe stand on their own and are fully implemented and tested.

## Open design questions (to turn Design-level items into code)

1. **Host adapter target.** For the real "Initiator" substrate, what is the
   intended target — a Linux host agent reading `perf`/MSRs/hwmon, a hypervisor
   module, or an emulator (QEMU) we instrument? This decides the `EventSource`
   adapter's language and shape.
2. **Negotiator scope.** Should the Negotiator (a) stay a reconciliation gate,
   or (b) grow into a layer-classifier that tags each request with its origin
   rung and negotiates the minimal sufficient representation across rungs? (b)
   is a real, interesting build; it needs a definition of "sufficient".
3. **Twins/Mayor/Governor as software.** Want me to implement these now as a
   pure-software verification pipeline over the existing core (parity gate →
   trace-only witness → circuit breaker on `ok === false`), clearly labeled as
   the software model, separate from any future hardware witness?

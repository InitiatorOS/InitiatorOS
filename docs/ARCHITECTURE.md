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
| "which layer is asking?" gate   | `negotiator.ts` + `layers.ts` — classify origin rung, formulate across the stack | **Implemented** |

**Note on rung 1.** The trace records transitions handed to it by an
`EventSource` / `FloorProbe`. Capturing the *actual silicon* transition (the
voltage edge itself) is below any JavaScript runtime and is Design-level here —
it requires a host/hardware adapter (see "Initiator", below).

## The OS lifecycle (boot → kernel → runtime)

This is an operating system, not a library with a gate bolted on. Its spine is
the lifecycle named at the outset — **bootloader → kernel → runtime hashed
events** — and the **Initiator is both bootloader and kernel in one root**
(`lib/initiator/initiator.ts`). There is no boot step that hands off to a
separate kernel, and no middleman between the root of trust and the interface.
The pasted floor-probe script is one subsystem of this whole (the runtime rung).

```
  INITIATOR (bootloader + kernel — one root)                      RUNTIME
  boot ─► supervise every transition                              hashed-event trace
  Twins ──► Mayor ──► Governor                                    + projection + Negotiator
  (parity)  (witness) (breaker)                                   + floor probe
     │         │          │
     │         │          └─ lockdown ──► queries refused until reset
     │         └─ reads trace facts only
     └─ O₁ (claimed) = O₂ (trace-derived)
                    │
           State Transition Door ── Central AI sees a metadata DoorView only
                                     never the trace
   every function above routes through ONE audited dispatch:
   logged + clocked (monotonic tick + timing) + hash-chained  →  zero-trust audit
```

- **Boot** (`lib/initiator/boot.ts`, run by the Initiator): load the persisted
  trace, re-verify (attest) its chain, map the floor once, seal the head. A
  broken prior chain cannot be sealed → the Initiator boots straight into
  lockdown. Boot is itself the first logged, clocked function (tick 1).
- **Kernel = the same Initiator**: every `step(input)` / `probeFloor()` appends
  to the trace and runs **Twins → Mayor → Governor** (organs in `lib/kernel/*`).
  Twin parity is the honest-fold check; the Mayor halts on any trace/parity
  discrepancy reading only trace facts; the Governor is the sticky breaker.
- **Door** (`lib/central/door.ts`): the Central AI observes a metadata-only
  `DoorView` — opaque head handle plus scalars — and never holds the trace.
- **Audit** (`lib/initiator/audit.ts`): the Initiator is the sole entry point,
  and every state-affecting operation is routed through one `audited` dispatch
  that logs it with a monotonic clock tick, its timing, completion flag, and a
  post-state digest, hash-chained. `verifyAudit()` checks the chain *and* that
  the ticks are gap-free — a missing tick would mean an operation bypassed the
  audit, which the single dispatch path makes impossible. That is the "no
  middleman" guarantee behind a safe zero-trust audit.
- **Runtime**: while nominal, the Initiator answers `query(request)` through the
  Negotiator; in lockdown it refuses every query until `resetGovernor()`.

Run `npm run os` for the whole lifecycle end to end (boot, four supervised
steps, a query, injected drift tripping the breaker, lockdown, reset), the
self-building section, and the clocked audit log.

## Self-building: slots, modules, and the base language

The framework works because it builds itself. When the system meets a piece that
is not yet defined, it does not ignore it and it does not fake it. It declares
the piece as a **variable the whole 3-stack knows is supposed to be there**, with
the functions it must provide — and keeps running around the hole.

**Slots** (`modules/slot.ts`). A `Slot` is a typed hole. It is either bound to a
module or an explicitly *defined undefined-variable*: resolving it never throws,
it reports its own `Contract` (name, rung, the functions required, its purpose).
A roadblock becomes a variable with a known shape, not a crash. This is the same
move the Negotiator makes at the query level (`missing: Requirement[]`), now a
first-class runtime mechanism — the architecture's "design-level" pieces are
literally these unbound slots.

**The module bus** (`modules/bus.ts`). `createOsBus()` pre-declares the standard
slots, all unbound:

| slot | rung | role |
| ---- | ---- | ---- |
| `actor.prediction` | CODE | Twin-1 enhancement (optional) |
| `actor.truth-bound` | CODE | Twin-2 reasoning (optional) |
| `actor.central` | INTERFACE | Central AI apex (optional) |
| `substrate.silicon` | VOLTAGE | host EventSource + FloorProbe (the only way to ground below MACHINE) |

`initiator.requirements()` returns the unbound ones live — the system's own account
of what it is missing and what each hole must provide. The kernel runs with
every slot empty; it never bricks.

**AI actors are hot-swappable modules** (`modules/actor.ts`). The three roles are
distinct and replaceable. An `Actor` is bound into a slot at runtime
(`initiator.bindActor`), rebound, or unbound — self-modification. An actor's
output is inert: attached to the result for observation, influencing no state,
and not itself verified. It cannot corrupt the floor because nothing downstream
consumes it as truth — but inert is not the same as verified. A module may wrap a **`Neuronet`**: a skill-specialized model reached
for like a hammer (the right tool for a task) instead of retraining a monolith.
`neuronetActor()` is that seam; a real model plugs in behind it.

**The base language** (`integrity/normalize.ts`). To sort across the rung
dialects the Negotiator needs one canonical form to reason in. `normalize`
compiles any set of fields into a de-tokenized, typed, rung-tagged `BaseForm`,
sorted ground-truth-first, with a `signature`. Every sufficient verdict carries
its `base` — the "different language" the Negotiator emits so disparate
representations can be compared and sorted.

## Named components

| Component | Framework role | Where / status |
| --------- | -------------- | -------------- |
| **Reconciler** | Algorithmic state-comparison engine | `reconciler.ts` — **Implemented**. Re-folds the trace, diffs every field (including ρ), re-verifies the chain. |
| **Initiator** (as a data structure) | Immutable append-only ledger of state transitions | `event-log.ts` + `hash.ts` — **Implemented**. Tamper-evident hash chain; `verifyChain` pinpoints any break. |
| **Initiator** (bootloader + kernel, one root) | Boot/attest AND supervise — no middleman between root of trust and interface; every function logged + clocked | `lib/initiator/initiator.ts` + `boot.ts` + `audit.ts` — **Implemented** (software model). Boots (loads, attests the chain, maps the floor, seals the head — a broken chain locks down), then runs as the kernel. Every operation routes through one audited dispatch: monotonic clock tick + timing + post-state digest, hash-chained; `verifyAudit()` is gap-proof. The software analog of measured boot + a zero-trust operation log. |
| **Initiator** (as "Ring -1 / VMX-root substrate") | Bare-metal capture of memory, registers, interrupts | **Design-level.** Not reachable from a JS runtime. Belongs to a host/hypervisor adapter behind the `EventSource` seam, written in C/Rust/asm — a separate project, not this module. A real hardware root of trust is what makes boot attestation un-spoofable. |
| **Negotiator** | Super-compiler / representation gate: asks *which layer* a request comes from and whether the representation along the stack is sufficient | **Implemented** (`negotiator.ts` + `layers.ts`). Classifies a request's origin rung from its evidence, formulates the asked-for fields down to the trace, and returns either a sufficient representation or the minimum requirement to make it so. Sufficiency is defined mechanically — see "The Negotiator" below. |
| **Twins** (parity O₁ = O₂) | Dual backend actors; block unless outputs are identical | `kernel/twins.ts` — **Implemented** (software model). Twin-1 takes the claimed representation, Twin-2 recomputes strictly from the trace; parity is exactly the reconciler's two sides. |
| **Mayor** | Silicon-only witness; compares Twins' output to raw telemetry | `kernel/mayor.ts` — **Implemented** (software model). Reads only trace facts (the hash chain) + the Twins' parity signal, never the representation; halts on any discrepancy. In a host build its telemetry source is the hardware adapter. |
| **Governor** | Dual-visibility circuit breaker; lockdown | `kernel/governor.ts` — **Implemented** (software model). Sticky breaker: trips on a Mayor halt and stays in lockdown until explicitly reset. The kernel refuses Negotiator queries while tripped. |
| **Central AI / State Transition Door** | Apex reasoning behind the gate; "synthetic intuition" = adapts weights only from its own telemetry, no raw-data access | **Boundary implemented; learning rule still open.** `central/door.ts` receives only a metadata `DoorView` (opaque head handle + scalars), never the trace or representation — the isolation boundary is real. The "adapts its own weights purely from telemetry it cannot directly read" mechanism is deliberately **not** implemented: it needs a concrete training signal and channel before it is code (see the caution below). The apex reasoning is an `actor.central` slot — bind any `Actor` (including a `neuronetActor` wrapping a specialized model) at runtime; unbound, the Door still runs. |
| **Floor probe** | Reachable / absent / gated classification | `floor-probe.ts` — **Implemented** (browser adapter). ISF_001 boundary classification at the capability level. |

## ISF nodes

| Node | Essence | Status here |
| ---- | ------- | ----------- |
| ISF_001 topological / invariant | collapse illegal states; classify boundaries | **Implemented** — the floor trichotomy / ρ at the capability level, and `nodes/isf001.ts` as an engine over audit gaps: a binary authorization flag + entropy delta, with proxy evidence (tests-passed, documentation-asserts, author-attestation) explicitly rejected. Silicon-timing/voltage *authentication* stays Design-level (see the caution below). |
| ISF_002 thermodynamic feedback | entropy/thermal anomaly → hard isolation | **Implemented as far as this substrate can measure** (`nodes/isf002.ts`): baselines on real audit timings, declares power-rail / thermal / bus-density **absent** rather than faking them, and performs autonomous isolation — a bound actor that throws or hangs is cut off at once, no human in the loop, the system continuing. A latency anomaly is recorded, never enforced: timing in a GC'd runtime is a software proxy (ISF_001). |
| ISF_003 semantic decoupling | strip tokens → typed boundary state | **Implemented** (`nodes/isf003.ts`): a gap's sentence is never read; it is forced into five mechanical variables — observed / observer / invariant / persistence / independence — each present or absent. Runtime inputs are likewise typed `RawEvent`s, not free text. Full NL→invariant parsing remains Design-level. |
| ISF_004 multi-order causal tracing | trace downstream structural consequences | **Implemented** (`nodes/isf004.ts`): strain = the weight of every load-bearing pillar resting on a gap × severity; a gap on one pillar is flagged horizontal (bounded). Produces the choke-point ranking — which gap to close first. The pillar weights are a declared model, not a measurement. |
| ISF_005 metacognitive boundary audit | halt when logic relies on vocabulary substitution | **Implemented** (`nodes/isf005.ts`), and still the design rule for this document: a gap naming no observable is vocabulary → **interrupt** (the whole accounting is marked invalid); a gap anchored only to provenance → **recalibrate** to its minimum requirement; only physical anchors proceed. |
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
   it cannot directly read.** The *isolation boundary* is now built
   (`central/door.ts`: the reasoning layer sees only a metadata `DoorView`,
   never the trace). The "adapts weights without access to the signal driving
   the adaptation" part is still self-contradictory as stated and needs a
   concrete mechanism (what is the training signal, and through what channel)
   before it can be implemented without hand-waving. The boundary ships; the
   learning rule does not.

Neither caution blocks the core above — the trace, projection, reconciler, and
floor probe stand on their own and are fully implemented and tested.

## The Negotiator (implemented)

`negotiator.ts` + `layers.ts` turn the "super-compiler" description into code: a
record is never simply handed out; a request is classified, a representation is
formulated down the stack, and the result is judged sufficient or insufficient.

**The rung stack** (`layers.ts`), ground-truth-first — lower is more authoritative:

```
  VOLTAGE  →  MACHINE  →  CODE  →  INTERFACE
  (physical   (hash-       (the      (UI / text /
   substrate)  chained      fold)     API view)
               trace)
```

VOLTAGE is below any JS runtime, so `DEEPEST_FORMULABLE = MACHINE`: absent a host
substrate adapter, the hash-chained trace is as deep as this runtime can ground
a claim. The Negotiator states that rather than pretending to reach the silicon.

**Origin classification.** A request does not declare its rung honestly, so the
true origin is inferred from the evidence it carries: cites a trace hash →
MACHINE; reads projected fields → CODE; renders to a human → INTERFACE. With no
evidence it is assumed to hold the *least* authority (INTERFACE), never ground
truth.

**Sufficiency** is mechanical — all four must hold, or the verdict is insufficient:

1. **grounded** — every requested field derives down to the trace.
2. **complete** — every requested field is resolvable (in the field registry).
3. **non-fabricating** — no asserted value exceeds or contradicts what the trace
   proves (e.g. asserting more `floor.gated` restrictions than were witnessed).
4. **layer-honest** — the request does not declare a deeper (more authoritative)
   rung than its evidence supports.

On insufficiency the Negotiator never improvises a value (Twin-2 non-lie
constraint). It returns the minimum `Requirement` that would make the request
sufficient:

| failure | requirement returned |
| ------- | -------------------- |
| asserted value drifts from the fold | `reconcile` — re-fold from the trace |
| over-claims proven restrictions | `probe` — run a floor probe to witness them |
| field not in the registry | `unknown-field` |
| physical (VOLTAGE) claim | `substrate-adapter` — needs a host/hardware source |

A sufficient verdict carries the grounded `representation`, the `derivation`
(the rung path from MACHINE up to the formulated rung), and a `checksum`. See
`test/negotiator.test.ts` for each path and `npm run demo` for a live run.

### Still open on the Negotiator

- The field registry (`FIELD_REGISTRY` in `layers.ts`) is the current vocabulary
  of formulable fields; extend it as the representation grows.
- "Sufficient" currently means the four criteria above. If a request should also
  carry a *freshness* or *quorum* requirement (e.g. ρ must be backed by a probe
  within N events), that is a clean extension point.

## The node layer (ISF_001–005): accounting for what cannot be audited

The first subset of ISF nodes is the machinery for an inability to audit. A gap
is never merely listed; it is declared as a variable (`nodes/gaps.ts`) and run
through the five engines (`nodes/layer.ts`), and the Initiator exposes the pass
as an audited function: `initiator.account()`.

```
  gap ──► ISF_003 decouple ──► ISF_001 constrain ──► ISF_004 trace ──► ISF_005 reflect
          five typed vars       authorized? ΔS        strain, pillars    proceed / recalibrate /
          (no prose survives)   proxies rejected      choke-point rank   interrupt (rejects all)

  runtime ──► ISF_002 correct: real timings baselined; power / thermal declared ABSENT;
              a failing source isolated at once (applied); a latency anomaly recorded (not applied)
```

Live figures from `npm run os` in this Node runtime: 6 gaps present, 2
authorized, total entropy 2.6, choke-point `single-author-twins` (strain 11 —
it rests on every test-backed claim), signal `recalibrate` (provenance cannot be
relabeled away), accounting `valid`. In the same run a failing Central actor was
isolated with the Governor still nominal and its slot back to a defined hole.

Two honesty properties the layer enforces on itself: each node declares which of
its own named inputs this substrate can actually supply (ISF_002 reports
power-rail, thermal and bus-density absent), and ISF_005 can reject the entire
accounting — if any gap is words rather than an observable, `valid` is false and
no summary number from the pass may be relied on.

## Verification ledger — proven vs. absent

The framework applied to its own verification. Only what was executed and
observed counts as proven; everything else is listed as *absent* — a defined
hole, not a pass and not a failure.

**Proven (observed in this environment):** `tsc --noEmit` clean · 39/39
`node:test` · both demos exit 0 · audit ticks contiguous · audit tamper
detection · concurrent `step()` calls serialized, with audit and trace in
agreement. That last item was a real defect: before serialization, five
concurrent steps logged five audit ticks while the trace kept one — four
unlogged transitions, undetected because the chain stayed valid. It was
reproduced, fixed in `Initiator.audited` (the sole dispatch now queues every
operation), and guarded by a regression test.

**Absent — exercised nowhere yet.** These are no longer only listed here: each is
a declared variable in `nodes/gaps.ts` and is processed by the node layer on
every `initiator.account()` — authorization, entropy, strain, isolation, and a
self-check (see "The node layer" above). The list:

- The audit log is in-memory; it does not persist across restarts.
- Boot is clocked as one tick; its sub-steps are not individually logged.
- Pure reads (`state`, `requirements`, `modules`, `snapshot`, `clock`,
  `auditLog`) are unaudited *by design* — ratify or reverse that choice.
- No real `gated` witness has been observed: Node has nothing to gate, so only
  synthetic gated witnesses have been tested. A sandboxed browser is where a
  real one appears.
- The browser `FloorProbe` adapter has never run in a browser here.
- Actor output is inert, not verified.
- The tests and the code share one author, so Twin-1 and Twin-2 are not yet
  independent. An independent reviewer or a second implementation is what makes
  parity meaningful.

## Open design questions (to turn Design-level items into code)

1. **Host adapter target.** The `substrate.silicon` slot is now declared and
   reported as a requirement (`provides: [start, run]`). What is the intended
   target to fill it — a Linux host agent reading `perf`/MSRs/hwmon, a
   hypervisor module, or an emulator (QEMU) we instrument? This decides the
   `EventSource`/`FloorProbe` adapter's language and shape; binding it is what
   lets a claim ground below MACHINE.
2. **Negotiator scope.** ~~Should the Negotiator grow into a layer-classifier?~~
   **Done** — see "The Negotiator" above. Remaining: extend the field registry
   and decide whether sufficiency should also require probe freshness/quorum.
3. **Twins/Mayor/Governor as software.** ~~Implement the supervisory pipeline?~~
   **Done** — see "The OS lifecycle" above (`kernel/*`, `boot/*`, `central/*`),
   clearly labeled as the software model and separate from any future hardware
   witness. Remaining: the Central AI learning rule (caution 2) and the host
   substrate adapter (question 1) are the two genuinely open pieces.

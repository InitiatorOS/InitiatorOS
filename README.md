# InitiatorOS

A zero-trust operating system where the representation a user sees must always
answer to an immutable record of what actually happened. Its spine is the
lifecycle **boot → kernel → runtime hashed events**, and the **Initiator is both
bootloader and kernel** — one root, no middleman between the root of trust and
the interface:

```
  INITIATOR (bootloader + kernel, one root)            RUNTIME
  boot → Twins → Mayor → Governor                  →   hashed-event trace
  (attest) (parity)(witness)(breaker)                  + projection + Negotiator
            └── supervise every transition ──┘          + floor probe

  every function routes through ONE audited dispatch:
  logged + clocked (tick + timing) + hash-chained  →   zero-trust audit
```

The Initiator boots itself (attest + seal), then runs as the kernel: every
transition goes through the self-auditing Twins/Mayor/Governor hierarchy, and a
proven discrepancy anywhere trips the Governor and locks the system down until
reset. Because the Initiator is the sole entry point, **every OS function is
logged and clocked** in a tamper-evident audit — nothing reaches the interface
unlogged, which is what makes the zero-trust audit safe.
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#the-os-lifecycle-boot--kernel--runtime)
for the whole map, and `npm run os` for the lifecycle end to end.

## The runtime subsystem: trace → projection → reconciler

The heart of the runtime (and the first piece built) is the integrity core:

```
  TRACE            →   PROJECTION        →   RECONCILER
  (ground truth)       (readable fold)       (the gate)

  immutable,           deterministic         re-folds the trace and
  hash-chained         pure fold of          reports every field where
  RawEvent log         the trace into a      the live representation has
  (event-log.ts)       Representation        drifted from ground truth
                       (projection.ts)       (reconciler.ts)
```

Nothing above the trace is trusted on its own. The reconciler re-derives the
representation from the trace and proves the two agree; any disagreement is
drift (an upper layer lying about state) or tampering (the trace itself altered,
caught by the hash chain). This is event-sourcing + a Merkle-style chain + state
reconciliation, assembled into one gate — and it is exactly the Twins' parity
check the kernel runs on every transition.

## The substrate is a variable

The core consumes *typed inputs* and classified *witnesses* — it never reaches
for a browser, a device, or a kernel directly. Those live behind two seams in
`source.ts`:

- **`EventSource`** — yields the inputs that get chained into the trace.
- **`FloorProbe`** — interrogates a runtime's capability boundary, classifying
  each handle as `reachable | absent | gated`.

`floor-probe.ts` is the **browser** `FloorProbe`. A host build supplies a
different probe over the same interface; the core above it does not change.
Likewise, trace storage is a swappable `TraceStore` (`persistence.ts`):
in-memory by default, `localStorage` in a browser, a device/file store on a
host.

## The floor trichotomy

The probe's whole point is one distinction:

| status      | meaning                                             | restriction? |
| ----------- | --------------------------------------------------- | ------------ |
| `reachable` | handle returned a value — state is inside the floor | no           |
| `absent`    | no handle exists (ENOENT) — the floor is finite     | no           |
| `gated`     | handle exists but returns a typed denial            | **yes**      |

Only `gated` is a restriction. A gated probe is a *reachable artifact proving an
unreachable state exists* — a witness `W(s) = <handle, typed-denial>` obtained
without ever reading the occluded value. ρ (`floor.gated`) is the count of such
proven boundaries, and it folds into the checksum, so the restriction map is
reconciled too.

## The Negotiator

A record is never simply handed out. `negotiator.ts` classifies which rung a
request comes from (inferred from its evidence, since a layer does not reliably
declare itself), formulates the asked-for fields down the stack
(`VOLTAGE → MACHINE → CODE → INTERFACE`) toward the trace, and judges the result
**sufficient** or **insufficient**. Sufficient requires all four of: *grounded*,
*complete*, *non-fabricating*, and *layer-honest*. When insufficient it returns
the minimum requirement to fix it — run a probe, re-reconcile, or supply a
substrate adapter for a physical claim it cannot verify — rather than inventing a
value. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#the-negotiator-implemented).

Across rungs it reasons in one **base language** (`normalize.ts`): every
sufficient answer carries a canonical, de-tokenized, rung-sorted `BaseForm` with
a signature — the common form that makes the dialects sortable.

## It builds itself

When the system meets a piece that isn't defined yet, it neither ignores nor
fakes it — it declares a **typed slot** the whole stack knows is supposed to be
there, with the functions it must provide, and keeps running around the hole
(`lib/modules/`). `initiator.requirements()` reports the unbound slots live — the
system's own account of what it's missing. The AI roles (Twin-1 prediction,
Twin-2 truth-bound, Central) are hot-swappable modules bound into those slots at
runtime; a module can wrap a **neuronet** — a skill-specialized model reached for
like a hammer instead of retraining a monolith. The kernel runs with every slot
empty and never bricks; binding a module is how it modifies its own performance.

## Run it

Requires Node ≥ 22.6 (for native TypeScript via `--experimental-strip-types`).

```bash
npm install        # dev deps: typescript, @types/node
npm run typecheck  # tsc --noEmit
npm test           # node --test over the suite
npm run demo       # runtime only: trace + real floor probe, reconcile clean, then catch injected drift
npm run os         # whole OS: boot → supervised steps → query → drift trips the breaker → reset → clocked audit
```

## Layout

```
lib/integrity/
  hash.ts          isomorphic SHA-256 + canonical (stable-key) JSON
  types.ts         RawEvent, Representation, WitnessRecord, ReconcileReport, …
  event-log.ts     appendEvent / verifyChain — the tamper-evident chain
  projection.ts    applyEvent / project / checksumOf — the deterministic fold
  reconciler.ts    reconcile — the comparison gate
  trace.ts         ingestInput / ingestWitnesses — fold inputs + witnesses into one chain
  persistence.ts   TraceStore seam (memory / localStorage) + flat load/save/clear
  source.ts        EventSource / FloorProbe seams (the substrate boundary)
  floor-probe.ts   the browser FloorProbe (reachable / absent / gated)
  layers.ts        the rung stack (VOLTAGE→MACHINE→CODE→INTERFACE) + field registry
  negotiator.ts    the Negotiator — classify a request's rung, formulate across the stack, judge sufficiency
  normalize.ts     the base language — compile fields into a canonical rung-sorted IR
  index.ts         integrity-core public API barrel
lib/modules/
  slot.ts          the self-building primitive — a typed hole that reports its own contract
  actor.ts         replaceable AI modules (3 distinct roles) + neuronet-as-tool seam
  bus.ts           the module bus — declare/bind/unbind slots, report requirements
lib/initiator/      THE INITIATOR — both bootloader and kernel, one root
  boot.ts          boot/attest — load + verify the chain, map the floor, seal the head
  initiator.ts     the Initiator — boot + supervise every transition + gated queries, all audited
  audit.ts         the clocked, hash-chained log of every OS function (zero-trust audit)
lib/kernel/         the Initiator's supervisory organs
  twins.ts         Twins — parity O₁=O₂ (claimed vs. trace-derived representation)
  mayor.ts         Mayor — trace-only witness; halts on any discrepancy
  governor.ts      Governor — sticky circuit breaker (lockdown until reset)
lib/central/
  door.ts          State Transition Door — Central AI sees metadata only
lib/os.ts          whole-OS public API barrel
demo.ts            runtime proof (trace + reconcile + negotiator)
os-demo.ts         whole-OS lifecycle proof
test/              node:test suite (integrity + negotiator + kernel + modules + audit)
docs/ARCHITECTURE.md   honest map of the full framework vs. what is implemented here
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the named components
(Initiator, Negotiator, Twins, Mayor, Governor, Reconciler, Central AI) and the
ISF nodes map onto this code — and which parts are implemented, which are
interface seams, and which are still design-level and deliberately **not** faked
here.

# InitiatorOS — integrity core

A substrate-agnostic verification core: the representation a user sees must
always answer to an immutable record of what actually happened. Three layers:

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
reconciliation, assembled into one gate.

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

## Run it

Requires Node ≥ 22.6 (for native TypeScript via `--experimental-strip-types`).

```bash
npm install        # dev deps: typescript, @types/node
npm run typecheck  # tsc --noEmit
npm test           # node --test over the suite
npm run demo       # build a trace + real floor probe, reconcile clean, then catch injected drift
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
  index.ts         public API barrel
demo.ts            runnable end-to-end proof
test/              node:test suite
docs/ARCHITECTURE.md   honest map of the full framework vs. what is implemented here
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the named components
(Initiator, Negotiator, Twins, Mayor, Governor, Reconciler, Central AI) and the
ISF nodes map onto this code — and which parts are implemented, which are
interface seams, and which are still design-level and deliberately **not** faked
here.

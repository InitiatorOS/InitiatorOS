/**
 * KERNEL — the Governor. The holistic circuit breaker and state governor.
 *
 * It sits above the Mayor with dual visibility: it is handed the Mayor's
 * trace-level verdict and may weigh higher-level signals, but like the Mayor it
 * is a non-actor — it generates no content and computes no logic. It is the
 * supreme breaker: once it trips, the whole system is in lockdown and stays
 * there until explicitly reset. Lockdown is sticky on purpose; a single proven
 * discrepancy does not clear itself because a later step happens to look fine.
 */
import type { MayorVerdict } from "./mayor.ts"

export type GovernorState = "nominal" | "lockdown"

export interface GovernorDecision {
  admit: boolean
  state: GovernorState
  reasons: string[]
}

export class Governor {
  private _state: GovernorState = "nominal"
  private _reasons: string[] = []

  get state(): GovernorState {
    return this._state
  }

  get reasons(): readonly string[] {
    return this._reasons
  }

  /** Fold the Mayor's verdict into the breaker state and decide admission. */
  evaluate(verdict: MayorVerdict): GovernorDecision {
    if (verdict.halt) {
      this._state = "lockdown"
      if (!this._reasons.includes(verdict.reason)) this._reasons.push(verdict.reason)
    }
    return { admit: this._state === "nominal", state: this._state, reasons: [...this._reasons] }
  }

  /** Explicitly clear lockdown. The only way out — nothing auto-recovers. */
  reset(): void {
    this._state = "nominal"
    this._reasons = []
  }
}

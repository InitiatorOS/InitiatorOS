/**
 * The node layer — ISF_001–005 run as one accounting pass over everything the
 * system cannot properly audit right now.
 *
 * Per gap, in this order: decouple the words into typed variables (003), collapse
 * to authorization + entropy (001), trace the structural strain (004), then audit
 * the accounting itself (005). ISF_002 is a circuit over the whole runtime, not a
 * per-gap classifier, so it runs once at the system level. If ISF_005 interrupts
 * on any gap, the accounting as a whole is marked invalid — it failed its own
 * audit, and no summary number from it may be relied on.
 */
import type { Accounting, AuditGap, GapAccount, MetaSignal, NodeContext } from "./types.ts"
import { deriveGaps } from "./gaps.ts"
import { ISF_003, decouple } from "./isf003.ts"
import { ISF_001, constrain } from "./isf001.ts"
import { ISF_004, trace } from "./isf004.ts"
import { ISF_002, correct } from "./isf002.ts"
import { ISF_005, reflect } from "./isf005.ts"

export const NODE_LAYER = [ISF_001, ISF_002, ISF_003, ISF_004, ISF_005] as const

const RANK: Record<MetaSignal, number> = { proceed: 0, recalibrate: 1, interrupt: 2 }

export function accountFor(ctx: NodeContext, gaps: AuditGap[] = deriveGaps(ctx)): Accounting {
  const accounts: GapAccount[] = gaps.map((gap) => {
    const semantic = decouple(gap)
    const constraint = constrain(gap, semantic)
    const strain = trace(gap)
    const meta = reflect(gap, semantic, constraint)
    return { gap, semantic, constraint, strain, meta }
  })

  const correction = correct(ctx)
  const totalEntropy = Number(accounts.reduce((sum, a) => sum + a.constraint.entropyDelta, 0).toFixed(2))
  const authorizedCount = accounts.filter((a) => a.constraint.authorized).length
  const chokePoints = [...accounts].sort((a, b) => b.strain.strainIndex - a.strain.strainIndex).map((a) => a.gap.id)
  const signal = accounts.reduce<MetaSignal>(
    (worst, a) => (RANK[a.meta.signal] > RANK[worst] ? a.meta.signal : worst),
    "proceed",
  )

  return { gaps: accounts, correction, totalEntropy, authorizedCount, chokePoints, signal, valid: signal !== "interrupt" }
}

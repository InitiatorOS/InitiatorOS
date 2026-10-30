/**
 * ISF_003 — Active-Variable Resolution and Semantic Decoupling Engine.
 *
 * Strips pre-compiled linguistic tokens and forces an abstract input into a
 * strict, typed boundary state so meaning cannot drift mid-argument.
 */
import type { AuditGap, Isf003Out, Presence } from "./types.ts"

export const ISF_003 = {
  id: "ISF_003",
  designation: "Active-Variable Resolution and Semantic Decoupling Engine",
} as const

/**
 * Strip the gap's sentence and keep only the typed variables it decomposes into.
 * `gap.statement` is deliberately never read here: the engine does not inherit
 * the dictionary meaning of "audit" (or any word). It maps the gap directly to
 * the five mechanical variables, and nothing else survives.
 */
export function decouple(gap: AuditGap): Isf003Out {
  const matrix: Record<string, Presence> = { ...gap.boundary }
  const detokenized = Object.entries(matrix).map(([variable, presence]) => `${variable}=${presence}`)
  return { nodeId: "ISF_003", boundary: gap.boundary, matrix, detokenized }
}

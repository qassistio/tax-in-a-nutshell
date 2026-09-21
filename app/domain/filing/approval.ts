// requirements.md §23 — Director Approval. A filing should not silently
// change after approval: we hash the exact artefacts approved, and any
// later change to those artefacts invalidates the approval.

export interface ApprovalRecord {
  approver: string
  role: string
  timestamp: string
  accountsRulesVersion: string
  corporationTaxRulesVersion: string
  declarationAccepted: boolean
  legalWording: string
  artefactHash: string
}

/** SHA-256 over the canonical (key-sorted) JSON of the approved artefacts.
 *  Runs entirely in the browser via Web Crypto — nothing is hashed
 *  server-side. */
export async function hashArtefacts(artefacts: Record<string, unknown>): Promise<string> {
  const json = canonicalJson(artefacts)
  const bytes = new TextEncoder().encode(json)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`
}

export function createApprovalRecord(input: {
  approver: string
  role: string
  accountsRulesVersion: string
  corporationTaxRulesVersion: string
  artefactHash: string
}): ApprovalRecord {
  return {
    approver: input.approver,
    role: input.role,
    timestamp: new Date().toISOString(),
    accountsRulesVersion: input.accountsRulesVersion,
    corporationTaxRulesVersion: input.corporationTaxRulesVersion,
    declarationAccepted: true,
    legalWording: 'Companies Act 2006 s.394 / s.450; CTA 2009 company tax return declaration, TIAN wording v1',
    artefactHash: input.artefactHash
  }
}

/** True once the live figures no longer match what was approved — the
 *  UI should treat the approval as invalidated and ask for a new one. */
export function isApprovalStale(record: ApprovalRecord | null, currentHash: string): boolean {
  return record === null || record.artefactHash !== currentHash
}

import { describe, expect, it } from 'vitest'
import { createApprovalRecord, hashArtefacts, isApprovalStale } from './approval'

describe('hashArtefacts', () => {
  it('is deterministic for the same artefacts', async () => {
    const a = await hashArtefacts({ foo: 1, bar: 'x' })
    const b = await hashArtefacts({ foo: 1, bar: 'x' })
    expect(a).toBe(b)
  })

  it('is independent of key order', async () => {
    const a = await hashArtefacts({ foo: 1, bar: 'x' })
    const b = await hashArtefacts({ bar: 'x', foo: 1 })
    expect(a).toBe(b)
  })

  it('changes when the artefacts change', async () => {
    const a = await hashArtefacts({ foo: 1 })
    const b = await hashArtefacts({ foo: 2 })
    expect(a).not.toBe(b)
  })

  it('produces a 64-character hex SHA-256 digest', async () => {
    const hash = await hashArtefacts({ foo: 1 })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('isApprovalStale', () => {
  it('is stale when there is no approval record', () => {
    expect(isApprovalStale(null, 'abc')).toBe(true)
  })

  it('is stale when the current hash no longer matches the approved hash', async () => {
    const record = createApprovalRecord({
      approver: 'A Director',
      role: 'Director',
      accountsRulesVersion: 'v1',
      corporationTaxRulesVersion: 'FY2024',
      artefactHash: 'abc'
    })
    expect(isApprovalStale(record, 'def')).toBe(true)
    expect(isApprovalStale(record, 'abc')).toBe(false)
  })
})

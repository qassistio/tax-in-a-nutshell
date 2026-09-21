import { describe, expect, it } from 'vitest'
import { findEligibilityProblems, isEligible, type EligibilityAnswers } from './eligibility'

const ALL_CLEAR: EligibilityAnswers = { audited: 'no', group: 'no', overseas: 'no', specialistRelief: 'no' }

describe('eligibility', () => {
  it('is eligible when every question is answered no', () => {
    expect(isEligible(ALL_CLEAR)).toBe(true)
    expect(findEligibilityProblems(ALL_CLEAR)).toHaveLength(0)
  })

  it('flags an unanswered question as an error rather than assuming eligibility', () => {
    const problems = findEligibilityProblems({ ...ALL_CLEAR, audited: '' })
    expect(problems).toHaveLength(1)
    expect(problems[0]!.title).toMatch(/not answered/i)
  })

  it('flags each scope-failing answer with an explanatory problem', () => {
    const problems = findEligibilityProblems({ ...ALL_CLEAR, group: 'yes' })
    expect(problems).toHaveLength(1)
    expect(problems[0]!.title).toMatch(/group/i)
    expect(isEligible({ ...ALL_CLEAR, group: 'yes' })).toBe(false)
  })

  it('reports every failing question at once', () => {
    const problems = findEligibilityProblems({ audited: 'yes', group: 'yes', overseas: 'no', specialistRelief: '' })
    expect(problems).toHaveLength(3)
  })
})

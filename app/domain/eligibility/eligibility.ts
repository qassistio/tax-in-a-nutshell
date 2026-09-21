// Eligibility / unsupported-case screening (requirements.md §2/§3.2/§34,
// §41's FilingCapabilities idea). Runs early so an out-of-scope company
// finds out before entering figures. A short checklist, not a general
// eligibility engine — this product only supports requirements.md §2/§40's
// fixed scope.

import type { FilingProblem } from '../types'

export interface EligibilityAnswers {
  /** 'yes' | 'no' | '' (unanswered) for each — kept as strings to match
   *  the rest of the wizard's form-field convention. */
  audited: string
  group: string
  overseas: string
  specialistRelief: string
  chargeableGains: string
}

interface EligibilityCheck {
  id: string
  answerKey: keyof EligibilityAnswers
  /** The answer value that means "out of scope". */
  failsOn: 'yes' | 'no'
  question: string
  title: string
  detail: string
}

export const ELIGIBILITY_CHECKS: EligibilityCheck[] = [
  {
    id: 'audit-required',
    answerKey: 'audited',
    failsOn: 'yes',
    question: 'Is the company required to have an audit, or does it not qualify for audit exemption?',
    title: 'Audit-required companies are not supported',
    detail: 'This product only files unaudited micro-entity accounts under the audit exemption. An audited company needs an accountant.'
  },
  {
    id: 'group-membership',
    answerKey: 'group',
    failsOn: 'yes',
    question: 'Is the company part of a group (a parent, subsidiary, or otherwise required to prepare consolidated accounts)?',
    title: 'Group companies are not supported',
    detail: 'Group and consolidated accounts are outside this product’s scope — each company here is filed as a standalone entity.'
  },
  {
    id: 'overseas-activity',
    answerKey: 'overseas',
    failsOn: 'yes',
    question: 'Does the company have any overseas permanent establishments, foreign currency accounts, or is it a controlled foreign company?',
    title: 'Overseas activity is not supported',
    detail: 'Foreign permanent establishments, controlled foreign companies and non-GBP accounts need specialist software.'
  },
  {
    id: 'specialist-relief',
    answerKey: 'specialistRelief',
    failsOn: 'yes',
    question: 'Is the company claiming R&D relief, Patent Box, creative-industry relief, or any other specialist tax relief?',
    title: 'Specialist tax reliefs are not supported',
    detail: 'R&D, Patent Box and creative-industry claims need their own supplementary pages, which this product doesn’t generate.'
  },
  {
    id: 'chargeable-gains',
    answerKey: 'chargeableGains',
    failsOn: 'yes',
    question: 'Did the company sell any property, shares, or other assets at a gain or loss during the period?',
    title: 'Chargeable gains are not supported',
    detail: 'Selling assets at a gain or loss needs extra CT600 pages this product doesn’t generate. An accountant or specialist software is needed instead.'
  }
]

/** One problem per unanswered or scope-failing question, in the same
 *  FilingProblem shape the rest of the validation pipeline uses, so the
 *  review screen can list and link to them exactly like any other. */
export function findEligibilityProblems(answers: EligibilityAnswers): FilingProblem[] {
  const problems: FilingProblem[] = []
  for (const check of ELIGIBILITY_CHECKS) {
    const answer = answers[check.answerKey]
    if (!answer) {
      problems.push({
        id: `eligibility-unanswered-${check.id}`,
        sev: 'error',
        step: 'eligibility',
        title: 'Eligibility question not answered',
        detail: check.question
      })
    } else if (answer === check.failsOn) {
      problems.push({
        id: `eligibility-fail-${check.id}`,
        sev: 'error',
        step: 'eligibility',
        title: check.title,
        detail: check.detail
      })
    }
  }
  return problems
}

export function isEligible(answers: EligibilityAnswers): boolean {
  return findEligibilityProblems(answers).length === 0
}

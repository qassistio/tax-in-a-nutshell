// requirements.md §30 — Rejection Handling. HMRC/GovTalk errors are numeric
// codes against a schema; this translates the ones known to be common into
// plain English, and where possible points at the step that would fix it.
// Unrecognised codes fall back to the raw HMRC text rather than being
// hidden — never invent a friendly message for an error we don't
// actually recognise.

import type { GovTalkErrorDetail } from './govTalk'
import type { StepId } from '../../composables/useFilingWizard'

export interface TranslatedError {
  code?: string
  headline: string
  detail: string
  step?: StepId
  rawText: string
}

interface KnownError {
  headline: string
  detail: string
  step?: StepId
}

// Common GovTalk/CT error codes, per HMRC's published error code lists.
// This is a starting set of the most frequently hit codes, not the full
// list — extend as real rejections surface unrecognised codes.
const KNOWN_ERRORS: Record<string, KnownError> = {
  '1046': {
    headline: 'Government Gateway sign-in was not accepted',
    detail: 'Check the Government Gateway user ID and password entered on the declaration step.',
    step: 'declaration'
  },
  '3001': {
    headline: 'The submission does not match the expected format',
    detail: 'This usually means a required field was left blank or a figure is in the wrong format — check the review step for anything unusual.',
    step: 'review'
  },
  '6011': {
    headline: 'This return has already been submitted',
    detail: 'HMRC already has a return for this company and accounting period. If you need to change it, this must go through as an amendment rather than a fresh submission.'
  },
  '9999': {
    headline: 'HMRC could not process this submission',
    detail: 'This is a generic HMRC gateway error rather than a validation problem with your figures — try again shortly, or contact the HMRC Online Services helpdesk if it persists.'
  }
}

export function translateGovTalkError(error: GovTalkErrorDetail): TranslatedError {
  const known = error.number ? KNOWN_ERRORS[error.number] : undefined
  if (known) {
    return { code: error.number, headline: known.headline, detail: known.detail, step: known.step, rawText: error.text }
  }
  return {
    code: error.number,
    headline: 'HMRC rejected this submission',
    detail: error.text || 'HMRC did not provide further detail — see the raw error below.',
    rawText: error.text
  }
}

export function translateGovTalkErrors(errors: GovTalkErrorDetail[]): TranslatedError[] {
  return errors.map(translateGovTalkError)
}

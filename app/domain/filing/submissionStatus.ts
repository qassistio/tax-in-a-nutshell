// requirements.md §24/§25 — HMRC and Companies House filing states are
// tracked independently; "HMRC Accepted, Companies House Rejected" is a
// valid combination, not a bug.

export type SubmissionStatus =
  | 'created' | 'validated' | 'approved' | 'queued'
  | 'submitted' | 'received' | 'accepted' | 'rejected'

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  created: 'Created',
  validated: 'Validated',
  approved: 'Approved',
  queued: 'Queued',
  submitted: 'Submitted',
  received: 'Received',
  accepted: 'Accepted',
  rejected: 'Rejected'
}

/** The order a filing normally moves through. `rejected` can follow any
 *  state from `queued` onward. */
const FORWARD_ORDER: SubmissionStatus[] = ['created', 'validated', 'approved', 'queued', 'submitted', 'received', 'accepted']

export function canAdvanceTo(current: SubmissionStatus, next: SubmissionStatus): boolean {
  if (next === 'rejected') return current !== 'created' && current !== 'validated'
  const from = FORWARD_ORDER.indexOf(current)
  const to = FORWARD_ORDER.indexOf(next)
  return from >= 0 && to === from + 1
}

export interface GatewayReceipt {
  target: 'hmrc' | 'companiesHouse'
  status: SubmissionStatus
  submissionId?: string
  correlationId?: string
  irMark?: string
  timestamp: string
  rawResponse?: string
  message?: string
}

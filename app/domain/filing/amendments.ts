// requirements.md §31 — Amendments. Every filed version stays immutable;
// an amendment is a new record chained to what came before, never an edit
// of the original. Since this product stores nothing server-side, the
// "previous filing" an amendment chains from is whatever receipt the user
// downloaded earlier and re-supplies — see StepReceipt.

export interface FieldChange {
  field: string
  label: string
  previous: string
  next: string
}

export interface Amendment {
  sequence: number
  reason: string
  changes: FieldChange[]
  taxDifference: number
  createdAt: string
  previousReceiptHash: string
}

/** Compares two flat field maps and returns only the fields that actually
 *  changed, labelled for display. */
export function diffFields(
  previous: Record<string, string>,
  next: Record<string, string>,
  labels: Record<string, string>
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const key of Object.keys(labels)) {
    const before = previous[key] ?? ''
    const after = next[key] ?? ''
    if (before !== after) {
      changes.push({ field: key, label: labels[key]!, previous: before, next: after })
    }
  }
  return changes
}

export function createAmendment(input: {
  sequence: number
  reason: string
  changes: FieldChange[]
  taxDifference: number
  previousReceiptHash: string
}): Amendment {
  return {
    sequence: input.sequence,
    reason: input.reason,
    changes: input.changes,
    taxDifference: input.taxDifference,
    createdAt: new Date().toISOString(),
    previousReceiptHash: input.previousReceiptHash
  }
}

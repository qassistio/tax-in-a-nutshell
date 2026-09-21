// Plain status lookup — what StepReceipt calls on mount/refresh so
// reloading the results page shows the current state without resending
// anything to HMRC. Use /api/hmrc/poll-ct600 (which needs the Government
// Gateway credentials again) to actually advance a still-processing
// submission; this route only reads what's already on record.

import { getSubmission } from '../../utils/db'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const row = await getSubmission(id)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Unknown submission' })
  return { row }
})

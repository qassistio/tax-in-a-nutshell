// Companies House XML Gateway authentication (TIS v5.3): the <SenderID>
// and <Authentication><Value> elements are lowercase MD5 hashes of the
// Presenter_ID and Presenter Authentication Code respectively — never
// sent in clear. Done server-side because the browser's Web Crypto
// SubtleCrypto has no MD5 algorithm (same reasoning as
// server/api/hmrc/compute-irmark.post.ts needing real C14N/SHA-1 —
// there, HMRC's IRmark; here, an old but CH-mandated hash).
//
// The Presenter_ID and Presenter Authentication Code are the two most
// sensitive Companies House credentials the wizard holds. They pass
// through this route only to be hashed and are never written to disk —
// see server/utils/db.ts, which stores gateway status metadata only.

import { createHash } from 'node:crypto'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ presenterId: string; presenterAuthCode: string }>(event)
  if (!body?.presenterId || !body?.presenterAuthCode) {
    throw createError({ statusCode: 400, statusMessage: 'Missing presenterId or presenterAuthCode' })
  }
  const senderIdHash = createHash('md5').update(body.presenterId, 'utf8').digest('hex')
  const authValueHash = createHash('md5').update(body.presenterAuthCode, 'utf8').digest('hex')
  return { senderIdHash, authValueHash }
})

// Builds and submits a real Companies House XML Gateway accounts envelope
// (see app/domain/filing/companiesHouseGovTalk.ts) to
// https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway and records the
// resulting status against a GUID-keyed row in the local SQLite store
// (server/utils/db.ts) — status metadata only, no accounting figures, no
// credentials.
//
// The envelope is built entirely here, server-side, rather than in the
// browser: the Presenter ID, Presenter Authentication Code and Package
// Reference are TaxInANutshell's own Companies House Software Filing
// credentials (like OAuth client credentials — they identify this
// software to the gateway, not the filer), so they're read from server
// env vars (NUXT_COMPANIES_HOUSE_PRESENTER_ID / _PRESENTER_AUTH_CODE /
// _PACKAGE_REFERENCE) and never sent to or held in the browser. Only the
// Company Authentication Code (specific to the company being filed for,
// issued by CH to that company) and the contact email come from the
// browser, same as before.
//
// Unlike HMRC's CT600 gateway, Companies House parses BOTH the GovTalk
// envelope AND the embedded iXBRL synchronously (TIS v5.9) — a
// `response`/`error` qualifier is the expected first reply, not
// necessarily an `acknowledgement` requiring a separate poll. This route
// records whichever qualifier comes back; further asynchronous processing
// against the SubmissionNumber (once parsing succeeds) is handled by
// poll-accounts.post.ts.

import { createHash } from 'node:crypto'
import { createSubmission, getSubmission, updateSubmission, nextChTransactionId } from '../../utils/db'
import { buildAccountsBase64, buildCompaniesHouseAccountsEnvelope, parseCompaniesHouseResponse } from '../../../app/domain/filing/companiesHouseGovTalk'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    id?: string
    companyName: string
    companyNumber: string
    periodEnd: string
    companyAuthCode: string
    email: string
    gatewayTest: boolean
    accountsIxbrl: string
  }>(event)
  if (!body?.accountsIxbrl || !body?.companyNumber) {
    throw createError({ statusCode: 400, statusMessage: 'Missing accountsIxbrl or companyNumber' })
  }

  const config = useRuntimeConfig()
  if (!config.companiesHousePresenterId || !config.companiesHousePresenterAuthCode || !config.companiesHousePackageReference) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Companies House presenter credentials are not configured on this server (NUXT_COMPANIES_HOUSE_PRESENTER_ID / _PRESENTER_AUTH_CODE / _PACKAGE_REFERENCE)'
    })
  }

  const id = body.id && await getSubmission(body.id) ? body.id : crypto.randomUUID()
  if (!await getSubmission(id)) {
    await createSubmission({ id, companyName: body.companyName ?? '', periodEnd: body.periodEnd ?? '' })
  }

  const senderIdHash = createHash('md5').update(config.companiesHousePresenterId, 'utf8').digest('hex')
  const authValueHash = createHash('md5').update(config.companiesHousePresenterAuthCode, 'utf8').digest('hex')
  // DB-backed, not a local counter — Companies House requires
  // <TransactionID> to strictly increase across the presenter's whole
  // history, which an in-memory counter can't guarantee across page
  // reloads (see nextChTransactionId in server/utils/db.ts).
  const transactionId = String(await nextChTransactionId())
  const submissionNumber = crypto.randomUUID().replace(/-/g, '').slice(0, 20)

  const envelopeXml = buildCompaniesHouseAccountsEnvelope({
    credentials: {
      companyAuthCode: body.companyAuthCode,
      packageReference: config.companiesHousePackageReference,
      email: body.email
    },
    gatewayTest: body.gatewayTest,
    companyNumber: body.companyNumber,
    companyName: body.companyName,
    transactionId,
    submissionNumber,
    accountsIxbrlBase64: buildAccountsBase64(body.accountsIxbrl),
    senderIdHash, authValueHash
  })

  await updateSubmission(id, {
    ch_transaction_id: transactionId,
    ch_submission_number: submissionNumber,
    ch_status: 'validated'
  })

  try {
    const response = await fetch(config.companiesHouseGatewayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      body: envelopeXml
    })
    const text = await response.text()
    const parsed = parseCompaniesHouseResponse(text)

    if (parsed.qualifier === 'error') {
      await updateSubmission(id, {
        ch_status: 'rejected',
        ch_raw_response: text,
        ch_message: parsed.errors.map(e => e.text).join('; ')
      })
    } else if (parsed.qualifier === 'acknowledgement') {
      await updateSubmission(id, {
        ch_status: 'submitted',
        ch_raw_response: text,
        ch_message: 'Companies House acknowledged the submission and is processing it.'
      })
    } else if (parsed.qualifier === 'response') {
      await updateSubmission(id, {
        ch_status: 'accepted',
        ch_raw_response: text,
        ch_message: 'Companies House accepted and parsed the accounts submission.'
      })
    } else {
      await updateSubmission(id, {
        ch_status: response.ok ? 'submitted' : 'rejected',
        ch_raw_response: text,
        ch_message: `Unrecognised Companies House response (HTTP ${response.status}) — could not determine qualifier.`
      })
    }

    return { id }
  } catch (err) {
    await updateSubmission(id, { ch_status: 'rejected', ch_message: `Could not reach Companies House gateway: ${(err as Error).message}` })
    return { id }
  }
})

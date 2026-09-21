import { computed, reactive } from 'vue'
import type { FilingSelection } from '../domain/types'
import { balanceSheetTotals, profitAndLossTotals, parsePounds, formatPounds } from '../domain/accounting/totals'
import { ratesFor, calculateCorporationTax } from '../domain/tax/corporationTax'
import { calculateDeadlines } from '../domain/filing/deadlines'
import { findProblems, findMissingAmountFields, MICRO_ENTITY_TURNOVER_LIMIT } from '../domain/validation/problems'
import { createAuditEntry, buildTaxableProfitTrail, type AuditEntry, type AuditCategory } from '../domain/audit/auditTrail'
import { hashArtefacts, createApprovalRecord, isApprovalStale, type ApprovalRecord } from '../domain/filing/approval'
import type { GatewayReceipt } from '../domain/filing/submissionStatus'
import { buildIrMarkHashingBody, buildGovTalkEnvelope, parseGovTalkResponse, type CtMessageClass } from '../domain/filing/govTalk'
import { buildAccountsBase64, buildCompaniesHouseAccountsEnvelope } from '../domain/filing/companiesHouseGovTalk'
import { generateAccountsIxbrl } from '../domain/ixbrl/accountsIxbrl'
import { generateTaxComputationIxbrl } from '../domain/ixbrl/taxComputationIxbrl'
import { diffFields, createAmendment, type Amendment } from '../domain/filing/amendments'
import { translateGovTalkErrors, type TranslatedError } from '../domain/filing/rejectionMessages'

/** Shape returned by the submission-status server routes — snake_case
 *  because it mirrors the SQLite row directly (server/utils/db.ts). */
interface SubmissionRowDto {
  id: string
  hmrc_status: string
  hmrc_correlation_id: string | null
  hmrc_submission_id: string | null
  hmrc_irmark: string | null
  hmrc_payload_hash: string | null
  hmrc_raw_response: string | null
  hmrc_message: string | null
  ch_status: string | null
  ch_message: string | null
  ch_transaction_id: string | null
  ch_submission_number: string | null
  ch_raw_response: string | null
  updated_at: string
}

export type StepId =
  | 'start' | 'company' | 'period' | 'balance' | 'pnl' | 'chSubmit' | 'tax' | 'notes' | 'review' | 'declaration' | 'receipt'

const STEP_LABELS: Record<StepId, string> = {
  start: 'Start',
  company: 'Company',
  period: 'Accounting period',
  balance: 'Balance sheet',
  pnl: 'Profit and loss',
  chSubmit: 'Companies House',
  tax: 'Tax computation',
  notes: 'Notes',
  review: 'Review',
  declaration: 'Declaration',
  receipt: 'Receipt'
}

/** Every value the wizard binds to an input, kept flat and stringly-typed
 *  like real form state — parsing into numbers happens in the domain
 *  layer, not here. Nothing is pre-filled: this is a blank return. */
function emptyFields() {
  return reactive({
    // company
    companyName: '', companyNumber: '', utr: '', address: '', postcode: '', sic: '',
    // accounting period
    periodStart: '', periodEnd: '', firstPeriod: '',
    // balance sheet
    unpaidCapital: '', fixedAssets: '', currentAssets: '', prepayments: '',
    creditorsWithin: '', creditorsAfter: '', provisions: '', shareCapital: '', retained: '',
    // profit and loss
    turnover: '', otherIncome: '', rawMaterials: '', staffCosts: '', depreciation: '', otherCharges: '',
    // tax computation
    addDepreciation: '', addEntertaining: '', capAllowances: '', associated: '',
    // notes
    avgEmployees: '', directorAdvances: '', commitments: '',
    // declaration
    approver: '', approvalDate: '', declName: '', declRole: '', gwUser: '', gwPass: '',
    // Companies House XML Gateway credentials (see
    // app/domain/filing/companiesHouseGovTalk.ts) — kept in browser memory
    // only, same as gwUser/gwPass above, never persisted server-side.
    chPresenterId: '', chAuthCode: '', chCompanyAuthCode: '', chPackageRef: '', chEmail: ''
  })
}

const GUIDED_BALANCE_FIELDS: Array<{ key: keyof ReturnType<typeof emptyFields>; label: string; help: string }> = [
  { key: 'unpaidCapital', label: 'Called up share capital not paid', help: 'Usually £0 unless shares were issued but not yet paid for.' },
  { key: 'fixedAssets', label: 'Fixed assets', help: 'Equipment, vehicles, property and other assets kept for continuing use, at net book value.' },
  { key: 'currentAssets', label: 'Current assets', help: 'Cash, bank balances, stock and amounts owed to the company that will be received within a year.' },
  { key: 'prepayments', label: 'Prepayments and accrued income', help: 'Amounts paid in advance for goods or services not yet received.' },
  { key: 'creditorsWithin', label: 'Creditors: amounts falling due within one year', help: 'Trade creditors, tax, VAT and short-term loans due within the next twelve months.' },
  { key: 'creditorsAfter', label: 'Creditors: amounts falling due after more than one year', help: 'Loans or other amounts not due for repayment within the next twelve months.' },
  { key: 'provisions', label: 'Provisions for liabilities', help: 'Amounts set aside for liabilities that are likely but not yet certain in amount or timing.' },
  { key: 'shareCapital', label: 'Called up share capital', help: 'The nominal value of shares issued.' },
  { key: 'retained', label: 'Profit and loss account / retained earnings', help: 'Accumulated profits or losses carried forward from this and earlier periods.' }
]

export function useFilingWizard() {
  const state = reactive({
    step: 'start' as StepId,
    filings: { accounts: true, ct600: true, companiesHouse: true } as FilingSelection,
    balanceEntryMode: 'table' as 'table' | 'guided',
    guidedIdx: 0,
    importOpen: false,
    importStage: 'drop' as 'drop' | 'map',
    importFileName: '',
    importRows: [] as import('../domain/accounting/trialBalanceImport').TrialBalanceRow[],
    importedFileName: '',
    declarationAgreed: false,
    auditLog: [] as AuditEntry[],
    approval: null as ApprovalRecord | null,
    vendorId: '',
    testInLive: true,
    // Companies House uses one URL for test and live traffic, chosen via
    // a <GatewayTest> flag rather than a different message Class the way
    // HMRC's testInLive above does — see companiesHouseGovTalk.ts.
    chGatewayTest: true,
    chTransactionSeq: 1,
    hmrcReceipt: null as GatewayReceipt | null,
    chReceipt: null as GatewayReceipt | null,
    submitting: false,
    chSubmitting: false,
    submitError: '',
    amendments: [] as Amendment[],
    submissionId: '',
    rejectionDetails: [] as TranslatedError[]
  })

  const AMENDABLE_FIELD_LABELS: Record<string, string> = {
    turnover: 'Turnover', otherIncome: 'Other income', rawMaterials: 'Cost of raw materials',
    staffCosts: 'Staff costs', depreciation: 'Depreciation', otherCharges: 'Other charges',
    fixedAssets: 'Fixed assets', currentAssets: 'Current assets', retained: 'Retained earnings',
    addDepreciation: 'Depreciation added back', addEntertaining: 'Entertaining added back',
    capAllowances: 'Capital allowances'
  }

  /** requirements.md §31 — chains a new Amendment from a previously
   *  downloaded receipt (re-supplied by the user, since only a submission
   *  status record persists server-side — no accounting figures) against
   *  the current, in-progress figures. */
  async function createAmendmentFromReceipt(previousReceiptJson: string, reason: string): Promise<Amendment> {
    const previous = JSON.parse(previousReceiptJson) as { fields: Record<string, string>; corporationTax?: number }
    const previousReceiptHash = await hashArtefacts(previous as unknown as Record<string, unknown>)
    const changes = diffFields(previous.fields, f as unknown as Record<string, string>, AMENDABLE_FIELD_LABELS)
    const taxDifference = corporationTax.value.corporationTax - (previous.corporationTax ?? corporationTax.value.corporationTax)
    const amendment = createAmendment({
      sequence: state.amendments.length + 1,
      reason, changes, taxDifference, previousReceiptHash
    })
    state.amendments.push(amendment)
    logEvent('amendment', `Amendment ${amendment.sequence} created: ${changes.length} field(s) changed, tax difference £${taxDifference}.`)
    return amendment
  }

  function logEvent(category: AuditCategory, message: string) {
    state.auditLog.push(createAuditEntry(category, message))
  }

  const f = emptyFields()

  const order = computed<StepId[]>(() => {
    // requirements.md §25 — accounts and CT600 are tracked as independent
    // filings, submitted to two different gateways (Companies House's XML
    // Gateway and HMRC's CT600 GovTalk gateway have no joint-filing API
    // between them). When both are chosen, accounts go to Companies House
    // first (there's a dedicated step for it, right after the figures
    // that make them up) and the CT600/tax computation follows — see
    // server/api/companies-house/submit-accounts.post.ts.
    const steps: StepId[] = ['start', 'company', 'period', 'balance', 'pnl']
    if (state.filings.companiesHouse) steps.push('chSubmit')
    if (state.filings.ct600) steps.push('tax')
    steps.push('notes', 'review', 'declaration', 'receipt')
    return steps
  })

  const currentIndex = computed(() => order.value.indexOf(state.step))

  function go(step: StepId) {
    state.step = step
  }

  function move(delta: number) {
    const idx = currentIndex.value + delta
    const next = order.value[idx]
    if (next) state.step = next
  }

  const balance = computed(() => balanceSheetTotals({
    unpaidCapital: parsePounds(f.unpaidCapital),
    fixedAssets: parsePounds(f.fixedAssets),
    currentAssets: parsePounds(f.currentAssets),
    prepayments: parsePounds(f.prepayments),
    creditorsWithin: parsePounds(f.creditorsWithin),
    creditorsAfter: parsePounds(f.creditorsAfter),
    provisions: parsePounds(f.provisions),
    shareCapital: parsePounds(f.shareCapital),
    retained: parsePounds(f.retained)
  }))

  const pnl = computed(() => profitAndLossTotals({
    turnover: parsePounds(f.turnover),
    otherIncome: parsePounds(f.otherIncome),
    rawMaterials: parsePounds(f.rawMaterials),
    staffCosts: parsePounds(f.staffCosts),
    depreciation: parsePounds(f.depreciation),
    otherCharges: parsePounds(f.otherCharges)
  }))

  const taxableTotalProfits = computed(() =>
    pnl.value.profitBeforeTax + parsePounds(f.addDepreciation) + parsePounds(f.addEntertaining) - parsePounds(f.capAllowances)
  )

  const rates = computed(() => ratesFor(f.periodEnd || new Date()))

  const corporationTax = computed(() =>
    calculateCorporationTax(taxableTotalProfits.value, parsePounds(f.associated), rates.value)
  )

  const deadlines = computed(() => calculateDeadlines(f.periodStart, f.periodEnd))

  const problems = computed(() => {
    const applicableSteps = new Set(['balance', 'pnl', ...(state.filings.ct600 ? ['tax'] : [])])
    return [
      ...findMissingAmountFields(f, applicableSteps),
      ...findProblems({
        balance: balance.value,
        utr: f.utr,
        avgEmployees: f.avgEmployees,
        directorAdvances: f.directorAdvances,
        turnover: parsePounds(f.turnover),
        addBackDepreciation: parsePounds(f.addDepreciation),
        accountsDepreciation: parsePounds(f.depreciation),
        microEntityTurnoverLimit: MICRO_ENTITY_TURNOVER_LIMIT
      })
    ]
  })

  const errorSteps = computed(() => new Set(problems.value.filter(p => p.sev === 'error').map(p => p.step)))
  const warnSteps = computed(() => new Set(problems.value.filter(p => p.sev === 'warn').map(p => p.step)))

  function stepStatus(step: StepId): 'done' | 'current' | 'error' | 'warn' | 'upcoming' {
    if (step === state.step) return 'current'
    if (errorSteps.value.has(step)) return 'error'
    if (warnSteps.value.has(step)) return 'warn'
    return order.value.indexOf(step) < currentIndex.value ? 'done' : 'upcoming'
  }

  const canSubmit = computed(() => problems.value.every(p => p.sev !== 'error') && state.declarationAgreed)

  // --- Audit trail ---
  const figureTrail = computed(() => buildTaxableProfitTrail({
    taxableTotalProfits: taxableTotalProfits.value,
    profitBeforeTax: pnl.value.profitBeforeTax,
    addDepreciation: parsePounds(f.addDepreciation),
    addEntertaining: parsePounds(f.addEntertaining),
    capAllowances: parsePounds(f.capAllowances),
    importedFrom: state.importedFileName
      ? { fileName: state.importedFileName, rowCount: state.importRows.length }
      : undefined
  }))

  // --- Approval (requirements.md §23) ---
  const approvalArtefacts = computed(() => ({ f: { ...f }, filings: { ...state.filings } }))

  async function currentArtefactHash() {
    return hashArtefacts(approvalArtefacts.value)
  }

  async function approveFiling() {
    const hash = await currentArtefactHash()
    state.approval = createApprovalRecord({
      approver: f.declName || f.approver,
      role: f.declRole || 'Director',
      accountsRulesVersion: 'FRS 105 2024',
      corporationTaxRulesVersion: rates.value.version,
      artefactHash: hash
    })
    logEvent('approval', `Approved by ${state.approval.approver} (${state.approval.role}).`)
  }

  async function checkApprovalStale(): Promise<boolean> {
    const hash = await currentArtefactHash()
    return isApprovalStale(state.approval, hash)
  }

  // --- iXBRL generation (requirements.md §19/§20) ---
  const company = computed(() => ({
    companyName: f.companyName, companyNumber: f.companyNumber, utr: f.utr,
    address: f.address, postcode: f.postcode, sic: f.sic
  }))
  const period = computed(() => ({
    periodStart: f.periodStart, periodEnd: f.periodEnd, firstPeriod: f.firstPeriod === 'yes'
  }))
  const adjustments = computed(() => ({
    addDepreciation: parsePounds(f.addDepreciation), addEntertaining: parsePounds(f.addEntertaining),
    capAllowances: parsePounds(f.capAllowances), associatedCompanies: parsePounds(f.associated)
  }))

  const accountsIxbrl = computed(() => generateAccountsIxbrl({
    company: company.value, period: period.value,
    balance: {
      unpaidCapital: parsePounds(f.unpaidCapital), fixedAssets: parsePounds(f.fixedAssets),
      currentAssets: parsePounds(f.currentAssets), prepayments: parsePounds(f.prepayments),
      creditorsWithin: parsePounds(f.creditorsWithin), creditorsAfter: parsePounds(f.creditorsAfter),
      provisions: parsePounds(f.provisions), shareCapital: parsePounds(f.shareCapital), retained: parsePounds(f.retained)
    },
    pnl: {
      turnover: parsePounds(f.turnover), otherIncome: parsePounds(f.otherIncome),
      rawMaterials: parsePounds(f.rawMaterials), staffCosts: parsePounds(f.staffCosts),
      depreciation: parsePounds(f.depreciation), otherCharges: parsePounds(f.otherCharges)
    }
  }))

  const taxComputationIxbrl = computed(() => generateTaxComputationIxbrl({
    company: company.value, period: period.value,
    profitBeforeTax: pnl.value.profitBeforeTax,
    adjustments: adjustments.value,
    result: corporationTax.value
  }))

  /** Maps the SQLite-backed status row onto the two GatewayReceipt values
   *  the UI reads, and re-derives plain-English rejection messages
   *  (requirements.md §30) from whatever raw GovTalk error text is on
   *  record. */
  function applySubmissionRow(row: SubmissionRowDto) {
    state.submissionId = row.id
    state.hmrcReceipt = {
      target: 'hmrc',
      status: row.hmrc_status as GatewayReceipt['status'],
      correlationId: row.hmrc_correlation_id ?? undefined,
      submissionId: row.hmrc_submission_id ?? undefined,
      irMark: row.hmrc_irmark ?? undefined,
      payloadHash: row.hmrc_payload_hash ?? undefined,
      rawResponse: row.hmrc_raw_response ?? undefined,
      message: row.hmrc_message ?? undefined,
      timestamp: row.updated_at
    }
    state.rejectionDetails = row.hmrc_status === 'rejected' && row.hmrc_raw_response
      ? translateGovTalkErrors(parseGovTalkErrorsFromRaw(row.hmrc_raw_response))
      : []
    if (row.ch_status) {
      state.chReceipt = {
        target: 'companiesHouse',
        status: row.ch_status as GatewayReceipt['status'],
        message: row.ch_message ?? undefined,
        submissionId: row.ch_submission_number ?? undefined,
        correlationId: row.ch_transaction_id ?? undefined,
        rawResponse: row.ch_raw_response ?? undefined,
        timestamp: row.updated_at
      }
    }
  }

  function parseGovTalkErrorsFromRaw(rawResponse: string) {
    const parsed = parseGovTalkResponse(rawResponse)
    return parsed.qualifier === 'error' ? parsed.errors : []
  }

  // --- HMRC submission (requirements.md §19/§24; legacy GovTalk/XML gateway) ---
  async function submitToHmrc() {
    state.submitting = true
    state.submitError = ''
    try {
      const messageClass: CtMessageClass = state.testInLive ? 'HMRC-CT-CT600-TIL' : 'HMRC-CT-CT600'
      const bodyXml = `<CompanyTaxReturn><TaxComputation><![CDATA[${taxComputationIxbrl.value}]]></TaxComputation></CompanyTaxReturn>`
      // IRmark is computed over the real <Body> content (empty IRmark, see
      // buildIrMarkHashingBody) using real W3C Exclusive C14N — done
      // server-side, not here, because that needs a real XML DOM/C14N
      // library (see server/api/hmrc/compute-irmark.post.ts).
      const hashingBody = buildIrMarkHashingBody({
        companyUtr: f.utr, companyName: f.companyName, periodEnd: f.periodEnd, bodyXml
      })
      const { irMark } = await $fetch<{ irMark: string }>('/api/hmrc/compute-irmark', {
        method: 'POST',
        body: { bodyXml: hashingBody }
      })
      const envelopeXml = buildGovTalkEnvelope({
        messageClass,
        credentials: { gatewayUserId: f.gwUser, gatewayPassword: f.gwPass, vendorId: state.vendorId },
        companyUtr: f.utr, companyName: f.companyName, periodEnd: f.periodEnd,
        bodyXml, irMark
      })
      const payloadHash = await hashArtefacts({ envelopeXml })

      const res = await $fetch<{ id: string }>('/api/hmrc/submit-ct600', {
        method: 'POST',
        body: { envelopeXml, companyName: f.companyName, periodEnd: f.periodEnd, messageClass, irMark, payloadHash }
      })

      const status = await $fetch<{ row: SubmissionRowDto }>(`/api/submissions/${res.id}`)
      applySubmissionRow(status.row)
      logEvent('submission', `Submitted to HMRC gateway (${messageClass}) — status: ${status.row.hmrc_status}.`)
    } catch (err) {
      state.submitError = (err as Error).message || 'Could not reach the HMRC gateway.'
      state.hmrcReceipt = { target: 'hmrc', status: 'rejected', timestamp: new Date().toISOString(), message: state.submitError }
      logEvent('submission', `HMRC submission failed: ${state.submitError}`)
    } finally {
      state.submitting = false
    }
  }

  /** Submits the accounts iXBRL to Companies House's real XML Gateway
   *  (see app/domain/filing/companiesHouseGovTalk.ts) — Class AA,
   *  GatewayTest-flagged, MD5-hashed presenter authentication. Follows
   *  the same shape as submitToHmrc: build a hashing/auth step server-side
   *  (MD5 isn't available in Web Crypto), build the envelope in the
   *  browser, hand it to a server route to actually reach the gateway. */
  async function submitToCompaniesHouse() {
    state.chSubmitting = true
    try {
      const { senderIdHash, authValueHash } = await $fetch<{ senderIdHash: string; authValueHash: string }>('/api/companies-house/compute-auth', {
        method: 'POST',
        body: { presenterId: f.chPresenterId, presenterAuthCode: f.chAuthCode }
      })

      const transactionId = String(state.chTransactionSeq++)
      const submissionNumber = crypto.randomUUID().replace(/-/g, '').slice(0, 20)

      const envelopeXml = buildCompaniesHouseAccountsEnvelope({
        credentials: {
          presenterId: f.chPresenterId,
          presenterAuthCode: f.chAuthCode,
          companyAuthCode: f.chCompanyAuthCode,
          packageReference: f.chPackageRef,
          email: f.chEmail
        },
        gatewayTest: state.chGatewayTest,
        companyNumber: f.companyNumber,
        companyName: f.companyName,
        transactionId,
        submissionNumber,
        accountsIxbrlBase64: buildAccountsBase64(accountsIxbrl.value),
        senderIdHash, authValueHash
      })

      const res = await $fetch<{ id: string }>('/api/companies-house/submit-accounts', {
        method: 'POST',
        body: {
          id: state.submissionId || undefined,
          envelopeXml, companyName: f.companyName, periodEnd: f.periodEnd,
          transactionId, submissionNumber
        }
      })

      const status = await $fetch<{ row: SubmissionRowDto }>(`/api/submissions/${res.id}`)
      applySubmissionRow(status.row)
      logEvent('submission', `Submitted to Companies House XML Gateway (Class AA, ${state.chGatewayTest ? 'test' : 'live'}) — status: ${status.row.ch_status}.`)
    } catch (err) {
      state.chReceipt = { target: 'companiesHouse', status: 'rejected', timestamp: new Date().toISOString(), message: (err as Error).message }
      logEvent('submission', `Companies House submission failed: ${(err as Error).message}`)
    } finally {
      state.chSubmitting = false
    }
  }

  /** Called on the receipt page mount/reload — just reads back whatever
   *  status is already on record, no gateway calls. */
  async function refreshSubmissionStatus(id: string) {
    const res = await $fetch<{ row: SubmissionRowDto }>(`/api/submissions/${id}`)
    applySubmissionRow(res.row)
  }

  /** Actively polls HMRC for a still-processing submission — needs the
   *  Government Gateway credentials again (GovTalk polls are
   *  authenticated the same way as the original submission). */
  async function pollHmrcStatus() {
    if (!state.submissionId) return
    const res = await $fetch<{ row: SubmissionRowDto }>('/api/hmrc/poll-ct600', {
      method: 'POST',
      body: { id: state.submissionId, gatewayUserId: f.gwUser, gatewayPassword: f.gwPass }
    })
    applySubmissionRow(res.row)
  }

  // --- Guided balance-sheet entry ---
  const guidedField = computed(() => GUIDED_BALANCE_FIELDS[state.guidedIdx] ?? GUIDED_BALANCE_FIELDS[0]!)
  const guidedTotal = GUIDED_BALANCE_FIELDS.length
  function guidedNext() { if (state.guidedIdx < guidedTotal - 1) state.guidedIdx++ }
  function guidedBack() { if (state.guidedIdx > 0) state.guidedIdx-- }

  // --- Trial balance import ---
  function importOpenDialog() {
    state.importOpen = true
    state.importStage = 'drop'
    state.importRows = []
    state.importFileName = ''
  }
  function importClose() {
    state.importOpen = false
  }
  async function importFile(file: File) {
    const { parseTrialBalanceCsv } = await import('../domain/accounting/trialBalanceImport')
    const text = await file.text()
    state.importFileName = file.name
    state.importRows = parseTrialBalanceCsv(text)
    state.importStage = 'map'
    logEvent('import', `Imported trial balance from ${file.name} (${state.importRows.length} rows).`)
  }
  async function importApply() {
    const { summariseTrialBalance } = await import('../domain/accounting/trialBalanceImport')
    const { totals } = summariseTrialBalance(state.importRows)
    for (const [key, value] of Object.entries(totals)) {
      if (key in f) (f as Record<string, string>)[key] = String(Math.round(value as number))
    }
    state.importedFileName = state.importFileName
    state.importOpen = false
    logEvent('mapping', `Mapped ${state.importRows.length} ledger accounts to ${Object.keys(totals).length} return fields.`)
  }

  return {
    state, f,
    order, currentIndex, go, move, stepStatus,
    STEP_LABELS,
    balance, pnl, taxableTotalProfits, rates, corporationTax, deadlines,
    problems, errorSteps, warnSteps, canSubmit,
    GUIDED_BALANCE_FIELDS, guidedField, guidedTotal, guidedNext, guidedBack,
    importOpenDialog, importClose, importFile, importApply,
    formatPounds,
    logEvent, figureTrail,
    approveFiling, checkApprovalStale,
    accountsIxbrl, taxComputationIxbrl,
    submitToHmrc, submitToCompaniesHouse,
    refreshSubmissionStatus, pollHmrcStatus,
    createAmendmentFromReceipt
  }
}

import { computed, reactive } from 'vue'
import type { FilingSelection } from '../domain/types'
import { balanceSheetTotals, profitAndLossTotals, parsePounds, formatPounds } from '../domain/accounting/totals'
import { ratesFor, calculateCorporationTax } from '../domain/tax/corporationTax'
import { capitalAllowanceRatesFor, calculateCapitalAllowances } from '../domain/tax/capitalAllowances'
import { applyLossRelief } from '../domain/tax/losses'
import { directorLoanRatesFor, assessDirectorLoan } from '../domain/tax/directorLoans'
import { findEligibilityProblems, type EligibilityAnswers } from '../domain/eligibility/eligibility'
import { previousPeriodFor } from '../domain/accounting/comparatives'
import { calculateDeadlines } from '../domain/filing/deadlines'
import { findProblems, findMissingAmountFields, MICRO_ENTITY_TURNOVER_LIMIT, REQUIRED_AMOUNT_FIELDS } from '../domain/validation/problems'
import { createAuditEntry, buildTaxableProfitTrail, type AuditEntry, type AuditCategory } from '../domain/audit/auditTrail'
import { hashArtefacts, createApprovalRecord, isApprovalStale, type ApprovalRecord } from '../domain/filing/approval'
import type { GatewayReceipt } from '../domain/filing/submissionStatus'
import { buildIrMarkHashingBody, buildGovTalkEnvelope, parseGovTalkResponse, type CtMessageClass } from '../domain/filing/govTalk'
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
  | 'start' | 'eligibility' | 'company' | 'period' | 'balance' | 'comparatives' | 'pnl' | 'chSubmit' | 'tax'
  | 'notes' | 'review' | 'declaration' | 'receipt'

const STEP_LABELS: Record<StepId, string> = {
  start: 'Start',
  eligibility: 'Eligibility',
  company: 'Company',
  period: 'Accounting period',
  balance: 'Balance sheet',
  comparatives: 'Prior year comparatives',
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
    // eligibility (requirements.md §3.2/§34) — 'yes' | 'no' | ''
    eligAudited: '', eligGroup: '', eligOverseas: '', eligSpecialistRelief: '',
    // company
    companyName: '', companyNumber: '', utr: '', address: '', postcode: '', sic: '',
    // accounting period
    periodStart: '', periodEnd: '', firstPeriod: '',
    // balance sheet
    unpaidCapital: '', fixedAssets: '', currentAssets: '', prepayments: '',
    creditorsWithin: '', creditorsAfter: '', provisions: '', shareCapital: '', retained: '',
    // prior-year comparatives (requirements.md §11) — same shape as the
    // balance sheet/P&L above, only asked for/required when firstPeriod
    // !== 'yes'
    cmpUnpaidCapital: '', cmpFixedAssets: '', cmpCurrentAssets: '', cmpPrepayments: '',
    cmpCreditorsWithin: '', cmpCreditorsAfter: '', cmpProvisions: '', cmpShareCapital: '', cmpRetained: '',
    cmpTurnover: '', cmpOtherIncome: '', cmpRawMaterials: '', cmpStaffCosts: '', cmpDepreciation: '', cmpOtherCharges: '',
    // profit and loss
    turnover: '', otherIncome: '', rawMaterials: '', staffCosts: '', depreciation: '', otherCharges: '',
    // tax computation — capital allowances are computed from these three
    // (requirements.md §12), not typed in directly; same for losses and
    // the director loan / s.455 charge below.
    addDepreciation: '', addEntertaining: '', associated: '',
    caPoolBroughtForward: '', caAdditions: '', caDisposals: '',
    lossesBroughtForward: '',
    directorLoanBalance: '', directorLoanRepaidBeforeDue: '',
    // notes
    avgEmployees: '', directorAdvances: '', commitments: '',
    // declaration
    approver: '', approvalDate: '', declName: '', declRole: '', gwUser: '', gwPass: '',
    // Companies House XML Gateway credentials (see
    // app/domain/filing/companiesHouseGovTalk.ts) that legitimately belong
    // in the browser: the Company Authentication Code is specific to the
    // company being filed for, and the contact email isn't a secret. The
    // Presenter ID, Presenter Authentication Code and Package Reference
    // are TaxInANutshell's own credentials, not the filer's — those live
    // server-side only (NUXT_COMPANIES_HOUSE_* env vars), never here.
    chCompanyAuthCode: '', chEmail: ''
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
    caPoolBroughtForward: 'Capital allowances pool brought forward', caAdditions: 'Capital allowances: additions',
    caDisposals: 'Capital allowances: disposals', lossesBroughtForward: 'Trading losses brought forward',
    directorLoanBalance: 'Director loan account balance'
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

  /** requirements.md §3.1 — "Where possible, public company information
   *  should be retrieved automatically from Companies House rather than
   *  entered manually." Searches Companies House's public register by
   *  name (server/api/companies-house/search.get.ts); does not touch `f`
   *  itself, since the filer still needs to pick the right result. */
  async function searchCompaniesHouse(query: string) {
    if (!query.trim()) return []
    const res = await $fetch<{ results: Array<{ companyNumber: string; companyName: string; status?: string; addressSnippet?: string }> }>(
      '/api/companies-house/search',
      { query: { q: query } }
    )
    return res.results
  }

  /** Looks up a single company by number and prefills what the public
   *  record actually holds — name, registered office, primary SIC code.
   *  The UTR is HMRC's identifier, not Companies House's, so it's never
   *  part of this response and still has to be typed in. */
  async function applyCompanyLookup(companyNumber: string) {
    const res = await $fetch<{ companyName: string; companyNumber: string; address: string; postcode: string; sic: string }>(
      `/api/companies-house/company/${encodeURIComponent(companyNumber)}`
    )
    f.companyName = res.companyName
    f.companyNumber = res.companyNumber
    if (res.address) f.address = res.address
    if (res.postcode) f.postcode = res.postcode
    if (res.sic) f.sic = res.sic
    logEvent('mapping', `Prefilled company details from Companies House for company number ${res.companyNumber}.`)
  }

  const order = computed<StepId[]>(() => {
    // requirements.md §25 — accounts and CT600 are tracked as independent
    // filings, submitted to two different gateways (Companies House's XML
    // Gateway and HMRC's CT600 GovTalk gateway have no joint-filing API
    // between them). When both are chosen, accounts go to Companies House
    // first (there's a dedicated step for it, right after the figures
    // that make them up) and the CT600/tax computation follows — see
    // server/api/companies-house/submit-accounts.post.ts.
    const steps: StepId[] = ['start', 'eligibility', 'company', 'period', 'balance']
    // requirements.md §11 — a first accounting period has nothing to
    // compare to, so the comparatives step only appears once the filer
    // has said (on the period step) that this isn't their first period.
    if (f.firstPeriod !== 'yes') steps.push('comparatives')
    steps.push('pnl')
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

  // --- Eligibility (requirements.md §3.2/§34) ---
  const eligibilityAnswers = computed<EligibilityAnswers>(() => ({
    audited: f.eligAudited, group: f.eligGroup, overseas: f.eligOverseas, specialistRelief: f.eligSpecialistRelief
  }))

  // --- Capital allowances (requirements.md §12) — AIA then main-pool WDA
  // over the aggregate additions/disposals/pool-brought-forward the filer
  // enters, in place of a per-asset register. ---
  const capitalAllowanceRates = computed(() => capitalAllowanceRatesFor(f.periodEnd || new Date()))
  const capitalAllowances = computed(() => calculateCapitalAllowances({
    poolBroughtForward: parsePounds(f.caPoolBroughtForward),
    additions: parsePounds(f.caAdditions),
    disposals: parsePounds(f.caDisposals),
    rates: capitalAllowanceRates.value
  }))

  // --- Trading losses (requirements.md §14) — brought-forward losses
  // relieved against the trading result after capital allowances. ---
  const tradingResultAfterCapitalAllowances = computed(() =>
    pnl.value.profitBeforeTax + parsePounds(f.addDepreciation) + parsePounds(f.addEntertaining) - capitalAllowances.value.totalAllowances
  )
  const lossRelief = computed(() => applyLossRelief({
    tradingResult: tradingResultAfterCapitalAllowances.value,
    lossesBroughtForward: parsePounds(f.lossesBroughtForward)
  }))

  const taxableTotalProfits = computed(() => lossRelief.value.taxableAfterLosses)

  const rates = computed(() => ratesFor(f.periodEnd || new Date()))

  const corporationTax = computed(() =>
    calculateCorporationTax(taxableTotalProfits.value, parsePounds(f.associated), rates.value)
  )

  // --- Director loans / Section 455 / CT600A (requirements.md §15/§17) ---
  const directorLoanRates = computed(() => directorLoanRatesFor(f.periodEnd || new Date()))
  const directorLoanAssessment = computed(() => assessDirectorLoan({
    balanceAtPeriodEnd: parsePounds(f.directorLoanBalance),
    repaidBeforeDue: f.directorLoanRepaidBeforeDue === 'yes'
  }, directorLoanRates.value))

  /** Corporation Tax plus any Section 455 charge — the total amount due
   *  to HMRC for the period, shown on review/receipt. */
  const totalTaxPayable = computed(() => corporationTax.value.corporationTax + directorLoanAssessment.value.s455Due)

  const deadlines = computed(() => calculateDeadlines(f.periodStart, f.periodEnd))

  const problems = computed(() => {
    const applicableSteps = new Set([
      'balance', 'pnl',
      ...(f.firstPeriod !== 'yes' ? ['comparatives'] : []),
      ...(state.filings.ct600 ? ['tax'] : [])
    ])
    return [
      ...findEligibilityProblems(eligibilityAnswers.value),
      ...findMissingAmountFields(f, applicableSteps),
      ...findProblems({
        balance: balance.value,
        utr: f.utr,
        avgEmployees: f.avgEmployees,
        directorAdvances: f.directorAdvances,
        turnover: parsePounds(f.turnover),
        addBackDepreciation: parsePounds(f.addDepreciation),
        accountsDepreciation: parsePounds(f.depreciation),
        microEntityTurnoverLimit: MICRO_ENTITY_TURNOVER_LIMIT,
        directorLoanBalance: parsePounds(f.directorLoanBalance),
        directorLoanRepaidAnswered: !!f.directorLoanRepaidBeforeDue
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

  /** Whether a step's own required inputs are filled in — used to gate the
   *  step nav (a step whose prerequisites aren't done yet is greyed out
   *  and unclickable, see app.vue), not to block the Continue/Back
   *  buttons within the guided flow itself. */
  function stepOwnFieldsFilled(step: StepId): boolean {
    const amountFieldsFor = (s: string) =>
      REQUIRED_AMOUNT_FIELDS.filter(x => x.step === s).every(x => String((f as Record<string, string>)[x.key] ?? '').trim())
    switch (step) {
      case 'start': return true
      // "Own fields filled" means every question answered, not that the
      // company necessarily passed — a scope failure is still an error on
      // the review screen (via findEligibilityProblems), it just doesn't
      // block moving on to see the rest of the wizard.
      case 'eligibility': return !!(f.eligAudited && f.eligGroup && f.eligOverseas && f.eligSpecialistRelief)
      case 'company': return !!(f.companyName.trim() && f.companyNumber.trim() && f.utr.trim())
      case 'period': return !!(f.periodStart && f.periodEnd)
      case 'balance': return amountFieldsFor('balance')
      case 'comparatives': return f.firstPeriod === 'yes' || amountFieldsFor('comparatives')
      case 'pnl': return amountFieldsFor('pnl')
      case 'chSubmit': return true
      case 'tax': return amountFieldsFor('tax')
      case 'notes': return !!f.avgEmployees.trim()
      case 'review': return true
      case 'declaration': return true
      // Only reachable once a submission actually exists (either just
      // submitted, or restored from a bookmarked ?submission= URL).
      case 'receipt': return !!state.submissionId
    }
  }

  /** Every step up to and including the first one whose own fields aren't
   *  filled in yet — everything after that stays locked in the nav. */
  const unlockedSteps = computed(() => {
    const unlocked = new Set<StepId>()
    for (const step of order.value) {
      unlocked.add(step)
      if (!stepOwnFieldsFilled(step)) break
    }
    return unlocked
  })

  function isStepUnlocked(step: StepId): boolean {
    return unlockedSteps.value.has(step)
  }

  const canSubmit = computed(() => problems.value.every(p => p.sev !== 'error') && state.declarationAgreed)

  // --- Audit trail ---
  const figureTrail = computed(() => buildTaxableProfitTrail({
    taxableTotalProfits: taxableTotalProfits.value,
    profitBeforeTax: pnl.value.profitBeforeTax,
    lossesRelieved: lossRelief.value.reliefUsed,
    addDepreciation: parsePounds(f.addDepreciation),
    addEntertaining: parsePounds(f.addEntertaining),
    capAllowances: capitalAllowances.value.totalAllowances,
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
    capAllowances: capitalAllowances.value.totalAllowances, associatedCompanies: parsePounds(f.associated)
  }))

  // requirements.md §11 — the comparative period is derived from the
  // current period's start date (one year immediately before it); only
  // built (and only asked for) when this isn't the company's first period.
  const comparativePeriod = computed(() => f.firstPeriod !== 'yes' ? previousPeriodFor(f.periodStart) : null)
  const comparative = computed(() => {
    if (f.firstPeriod === 'yes' || !comparativePeriod.value) return undefined
    return {
      period: { ...comparativePeriod.value, firstPeriod: false },
      figures: {
        unpaidCapital: parsePounds(f.cmpUnpaidCapital), fixedAssets: parsePounds(f.cmpFixedAssets),
        currentAssets: parsePounds(f.cmpCurrentAssets), prepayments: parsePounds(f.cmpPrepayments),
        creditorsWithin: parsePounds(f.cmpCreditorsWithin), creditorsAfter: parsePounds(f.cmpCreditorsAfter),
        provisions: parsePounds(f.cmpProvisions), shareCapital: parsePounds(f.cmpShareCapital), retained: parsePounds(f.cmpRetained),
        turnover: parsePounds(f.cmpTurnover), otherIncome: parsePounds(f.cmpOtherIncome),
        rawMaterials: parsePounds(f.cmpRawMaterials), staffCosts: parsePounds(f.cmpStaffCosts),
        depreciation: parsePounds(f.cmpDepreciation), otherCharges: parsePounds(f.cmpOtherCharges)
      }
    }
  })

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
    },
    comparative: comparative.value
  }))

  const taxComputationIxbrl = computed(() => generateTaxComputationIxbrl({
    company: company.value, period: period.value,
    profitBeforeTax: pnl.value.profitBeforeTax,
    adjustments: adjustments.value,
    result: corporationTax.value,
    lossesRelieved: lossRelief.value.reliefUsed,
    directorLoan: directorLoanAssessment.value,
    directorLoanBalance: parsePounds(f.directorLoanBalance)
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
   *  GatewayTest-flagged, MD5-hashed presenter authentication. Unlike
   *  submitToHmrc, the envelope is built entirely server-side now: the
   *  Presenter ID / Presenter Authentication Code / Package Reference are
   *  TaxInANutshell's own credentials (server env vars), not the filer's,
   *  so they never pass through the browser — only the Company
   *  Authentication Code and contact email do. */
  async function submitToCompaniesHouse() {
    state.chSubmitting = true
    try {
      const res = await $fetch<{ id: string }>('/api/companies-house/submit-accounts', {
        method: 'POST',
        body: {
          id: state.submissionId || undefined,
          companyName: f.companyName,
          companyNumber: f.companyNumber,
          periodEnd: f.periodEnd,
          companyAuthCode: f.chCompanyAuthCode,
          email: f.chEmail,
          gatewayTest: state.chGatewayTest,
          accountsIxbrl: accountsIxbrl.value
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

  /** Actively polls Companies House for a still-processing accounts
   *  submission — unlike pollHmrcStatus, needs no credentials from the
   *  browser: the presenter identity is TaxInANutshell's own, read
   *  server-side from env vars (see poll-accounts.post.ts). */
  async function pollCompaniesHouseStatus() {
    if (!state.submissionId) return
    const res = await $fetch<{ row: SubmissionRowDto }>('/api/companies-house/poll-accounts', {
      method: 'POST',
      body: { id: state.submissionId, email: f.chEmail, gatewayTest: state.chGatewayTest }
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
    order, currentIndex, go, move, stepStatus, isStepUnlocked,
    STEP_LABELS,
    balance, pnl, taxableTotalProfits, rates, corporationTax, deadlines,
    eligibilityAnswers,
    capitalAllowanceRates, capitalAllowances,
    lossRelief,
    directorLoanRates, directorLoanAssessment, totalTaxPayable,
    comparativePeriod,
    problems, errorSteps, warnSteps, canSubmit,
    GUIDED_BALANCE_FIELDS, guidedField, guidedTotal, guidedNext, guidedBack,
    importOpenDialog, importClose, importFile, importApply,
    formatPounds,
    logEvent, figureTrail,
    approveFiling, checkApprovalStale,
    accountsIxbrl, taxComputationIxbrl,
    submitToHmrc, submitToCompaniesHouse,
    refreshSubmissionStatus, pollHmrcStatus, pollCompaniesHouseStatus,
    createAmendmentFromReceipt,
    searchCompaniesHouse, applyCompanyLookup
  }
}

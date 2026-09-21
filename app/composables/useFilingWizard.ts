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
import { buildIrMarkHashingBody, parseGovTalkResponse } from '../domain/filing/govTalk'
import { generateAccountsIxbrl } from '../domain/ixbrl/accountsIxbrl'
import { generateTaxComputationIxbrl } from '../domain/ixbrl/taxComputationIxbrl'
import { diffFields, createAmendment, type Amendment } from '../domain/filing/amendments'
import { translateGovTalkErrors, type TranslatedError } from '../domain/filing/rejectionMessages'

/** Submission-status server routes' shape — snake_case, mirrors the SQLite row directly. */
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
  | 'start' | 'eligibility' | 'company' | 'period' | 'balance' | 'pnl' | 'chSubmit' | 'tax'
  | 'notes' | 'review' | 'declaration' | 'receipt'

const STEP_LABELS: Record<StepId, string> = {
  start: 'Start',
  eligibility: 'Eligibility',
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

/** Every wizard input field, flat and stringly-typed like real form state
 *  — parsing into numbers happens in the domain layer, not here. */
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
    // prior-year comparatives (requirements.md §11), same shape as above; only
    // required when firstPeriod !== 'yes'
    cmpUnpaidCapital: '', cmpFixedAssets: '', cmpCurrentAssets: '', cmpPrepayments: '',
    cmpCreditorsWithin: '', cmpCreditorsAfter: '', cmpProvisions: '', cmpShareCapital: '', cmpRetained: '',
    cmpTurnover: '', cmpOtherIncome: '', cmpRawMaterials: '', cmpStaffCosts: '', cmpDepreciation: '', cmpOtherCharges: '',
    // profit and loss
    turnover: '', otherIncome: '', rawMaterials: '', staffCosts: '', depreciation: '', otherCharges: '',
    // tax computation — capital allowances/losses/s.455 are all derived from
    // these (requirements.md §12), not typed in directly
    addDepreciation: '', addEntertaining: '', associated: '',
    caPoolBroughtForward: '', caAdditions: '', caDisposals: '',
    lossesBroughtForward: '',
    directorLoanBalance: '', directorLoanRepaidBeforeDue: '',
    // notes
    avgEmployees: '', directorAdvances: '', commitments: '',
    // declaration
    approver: '', approvalDate: '', declName: '', declRole: '', gwUser: '', gwPass: '',
    // Companies House fields that legitimately live in the browser (auth
    // code is company-specific, email isn't secret) — TaxInANutshell's own
    // presenter credentials stay server-side (NUXT_COMPANIES_HOUSE_* env
    // vars), never here. See app/domain/filing/companiesHouseGovTalk.ts.
    chCompanyAuthCode: '', chEmail: ''
  })
}

type FieldKey = keyof ReturnType<typeof emptyFields>

/** Current-year question plus its cmp*-prefixed comparative counterpart
 *  (see StepBalance.vue) — guidedSteps below flattens this into the actual
 *  question sequence, asking each prior-year figure right after its
 *  current-year one. */
const GUIDED_BALANCE_FIELDS: Array<{ key: FieldKey; label: string; help: string; comparativeKey?: FieldKey }> = [
  { key: 'unpaidCapital', label: 'Called up share capital not paid', help: 'Usually £0 unless shares were issued but not yet paid for.', comparativeKey: 'cmpUnpaidCapital' },
  { key: 'fixedAssets', label: 'Fixed assets', help: 'Equipment, vehicles, property and other assets kept for continuing use, at net book value.', comparativeKey: 'cmpFixedAssets' },
  { key: 'currentAssets', label: 'Current assets', help: 'Cash, bank balances, stock and amounts owed to the company that will be received within a year.', comparativeKey: 'cmpCurrentAssets' },
  { key: 'prepayments', label: 'Prepayments and accrued income', help: 'Amounts paid in advance for goods or services not yet received.', comparativeKey: 'cmpPrepayments' },
  { key: 'creditorsWithin', label: 'Creditors: amounts falling due within one year', help: 'Trade creditors, tax, VAT and short-term loans due within the next twelve months.', comparativeKey: 'cmpCreditorsWithin' },
  { key: 'creditorsAfter', label: 'Creditors: amounts falling due after more than one year', help: 'Loans or other amounts not due for repayment within the next twelve months.', comparativeKey: 'cmpCreditorsAfter' },
  { key: 'provisions', label: 'Provisions for liabilities', help: 'Amounts set aside for liabilities that are likely but not yet certain in amount or timing.', comparativeKey: 'cmpProvisions' },
  { key: 'shareCapital', label: 'Called up share capital', help: 'The nominal value of shares issued.', comparativeKey: 'cmpShareCapital' },
  { key: 'retained', label: 'Profit and loss account / retained earnings', help: 'Accumulated profits or losses carried forward from this and earlier periods.', comparativeKey: 'cmpRetained' }
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
    // Test-In-Live/GatewayTest flags aren't client state — they're
    // server-only env vars (hmrcTestInLive, companiesHouseGatewayTest, see
    // nuxt.config.ts) read directly by the submit/poll API routes.
    hmrcReceipt: null as GatewayReceipt | null,
    chReceipt: null as GatewayReceipt | null,
    // Steps the filer has left at least once — gates "this is blank"
    // errors (StepProblems.vue, stepStatus below) so a freshly-arrived
    // step doesn't immediately flag as an error.
    visitedSteps: new Set<StepId>(),
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
   *  downloaded receipt (re-supplied by the user; only submission status
   *  persists server-side) against the current, in-progress figures. */
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

  /** requirements.md §3.1 — searches Companies House's public register by
   *  name; doesn't touch `f` itself since the filer still picks a result. */
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
    // requirements.md §25 — accounts and CT600 go to two separate gateways
    // with no joint-filing API, so when both are selected, accounts (via
    // Companies House) come first and CT600/tax follows.
    // requirements.md §11 — comparatives are a second column on the
    // balance/pnl steps themselves (not a separate step), shown only when
    // firstPeriod !== 'yes'.
    const steps: StepId[] = ['start', 'eligibility', 'company', 'period', 'balance', 'pnl']
    if (state.filings.companiesHouse) steps.push('chSubmit')
    if (state.filings.ct600) steps.push('tax')
    steps.push('notes', 'review', 'declaration', 'receipt')
    return steps
  })

  const currentIndex = computed(() => order.value.indexOf(state.step))

  function go(step: StepId) {
    state.visitedSteps.add(state.step)
    state.step = step
  }

  function move(delta: number) {
    const idx = currentIndex.value + delta
    const next = order.value[idx]
    if (next) {
      state.visitedSteps.add(state.step)
      state.step = next
    }
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

  // Prior-year totals for the comparative column — same shape as balance/pnl,
  // fed from the cmp*-prefixed fields. Not gated on f.firstPeriod here; the
  // components decide whether to render the column.
  const comparativeBalance = computed(() => balanceSheetTotals({
    unpaidCapital: parsePounds(f.cmpUnpaidCapital),
    fixedAssets: parsePounds(f.cmpFixedAssets),
    currentAssets: parsePounds(f.cmpCurrentAssets),
    prepayments: parsePounds(f.cmpPrepayments),
    creditorsWithin: parsePounds(f.cmpCreditorsWithin),
    creditorsAfter: parsePounds(f.cmpCreditorsAfter),
    provisions: parsePounds(f.cmpProvisions),
    shareCapital: parsePounds(f.cmpShareCapital),
    retained: parsePounds(f.cmpRetained)
  }))

  const comparativePnl = computed(() => profitAndLossTotals({
    turnover: parsePounds(f.cmpTurnover),
    otherIncome: parsePounds(f.cmpOtherIncome),
    rawMaterials: parsePounds(f.cmpRawMaterials),
    staffCosts: parsePounds(f.cmpStaffCosts),
    depreciation: parsePounds(f.cmpDepreciation),
    otherCharges: parsePounds(f.cmpOtherCharges)
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

  /** Corporation Tax plus any Section 455 charge — total due to HMRC. */
  const totalTaxPayable = computed(() => corporationTax.value.corporationTax + directorLoanAssessment.value.s455Due)

  const deadlines = computed(() => calculateDeadlines(f.periodStart, f.periodEnd))

  const problems = computed(() => {
    const applicableSteps = new Set([
      'balance', 'pnl',
      ...(state.filings.ct600 ? ['tax'] : [])
    ])
    return [
      ...findEligibilityProblems(eligibilityAnswers.value),
      ...findMissingAmountFields(f, applicableSteps, f.firstPeriod !== 'yes'),
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
    // Same staleness rule as StepProblems.vue — only flag error/warn once visited.
    if (state.visitedSteps.has(step)) {
      if (errorSteps.value.has(step)) return 'error'
      if (warnSteps.value.has(step)) return 'warn'
    }
    return order.value.indexOf(step) < currentIndex.value ? 'done' : 'upcoming'
  }

  /** Whether a step's own required inputs are filled in — gates the step
   *  nav (unfilled prerequisites grey it out, see app.vue). */
  function stepOwnFieldsFilled(step: StepId): boolean {
    const amountFieldsFor = (s: string) =>
      REQUIRED_AMOUNT_FIELDS
        .filter(x => x.step === s && (!x.comparative || f.firstPeriod !== 'yes'))
        .every(x => String((f as Record<string, string>)[x.key] ?? '').trim())
    switch (step) {
      case 'start': return true
      // "Filled" means answered, not passing — an eligibility failure still
      // shows as an error on review but doesn't block moving on.
      case 'eligibility': return !!(f.eligAudited && f.eligGroup && f.eligOverseas && f.eligSpecialistRelief)
      case 'company': return !!(f.companyName.trim() && f.companyNumber.trim() && f.utr.trim())
      case 'period': return !!(f.periodStart && f.periodEnd)
      case 'balance': return amountFieldsFor('balance')
      case 'pnl': return amountFieldsFor('pnl')
      case 'chSubmit': return true
      case 'tax': return amountFieldsFor('tax')
      case 'notes': return !!f.avgEmployees.trim()
      case 'review': return true
      case 'declaration': return true
      // Only reachable once a submission exists (just submitted, or restored
      // from a bookmarked ?submission= URL).
      case 'receipt': return !!state.submissionId
    }
  }

  /** Every step up to the first one whose own fields aren't filled —
   *  everything after that stays locked in the nav. */
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

  /** Whether Continue is enabled on the current step. Same rule as
   *  stepOwnFieldsFilled, except chSubmit — that step has nothing to type,
   *  but requires an actual (non-rejected) submission before moving on. */
  const canContinue = computed(() => {
    if (state.step === 'chSubmit') return !!state.chReceipt && state.chReceipt.status !== 'rejected'
    return stepOwnFieldsFilled(state.step)
  })

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

  // requirements.md §11 — comparative period is one year before the current
  // period's start; only built when this isn't the first period.
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

  /** Maps the SQLite status row onto the two GatewayReceipt values the UI
   *  reads, and re-derives plain-English rejection messages (§30). */
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
      const bodyXml = `<CompanyTaxReturn><TaxComputation><![CDATA[${taxComputationIxbrl.value}]]></TaxComputation></CompanyTaxReturn>`
      // IRmark needs real W3C Exclusive C14N, computed server-side (see
      // compute-irmark.post.ts).
      const hashingBody = buildIrMarkHashingBody({
        companyUtr: f.utr, companyName: f.companyName, periodEnd: f.periodEnd, bodyXml
      })
      const { irMark } = await $fetch<{ irMark: string }>('/api/hmrc/compute-irmark', {
        method: 'POST',
        body: { bodyXml: hashingBody }
      })

      // Envelope (message Class, Test-In-Live vs live) is built server-side
      // so it can't be overridden from the browser — see submit-ct600.post.ts.
      const res = await $fetch<{ id: string }>('/api/hmrc/submit-ct600', {
        method: 'POST',
        body: {
          bodyXml, companyUtr: f.utr, companyName: f.companyName, periodEnd: f.periodEnd, irMark,
          gatewayUserId: f.gwUser, gatewayPassword: f.gwPass, vendorId: state.vendorId
        }
      })

      const status = await $fetch<{ row: SubmissionRowDto }>(`/api/submissions/${res.id}`)
      applySubmissionRow(status.row)
      logEvent('submission', `Submitted to HMRC gateway — status: ${status.row.hmrc_status}.`)
    } catch (err) {
      state.submitError = (err as Error).message || 'Could not reach the HMRC gateway.'
      state.hmrcReceipt = { target: 'hmrc', status: 'rejected', timestamp: new Date().toISOString(), message: state.submitError }
      logEvent('submission', `HMRC submission failed: ${state.submitError}`)
    } finally {
      state.submitting = false
    }
  }

  /** Submits accounts iXBRL to Companies House's XML Gateway (Class AA,
   *  see companiesHouseGovTalk.ts). Envelope is built server-side; only the
   *  Company Authentication Code and contact email pass through the browser
   *  — TaxInANutshell's own presenter credentials stay server-side. */
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
          accountsIxbrl: accountsIxbrl.value
        }
      })

      const status = await $fetch<{ row: SubmissionRowDto }>(`/api/submissions/${res.id}`)
      applySubmissionRow(status.row)
      logEvent('submission', `Submitted to Companies House XML Gateway (Class AA) — status: ${status.row.ch_status}.`)
    } catch (err) {
      state.chReceipt = { target: 'companiesHouse', status: 'rejected', timestamp: new Date().toISOString(), message: (err as Error).message }
      logEvent('submission', `Companies House submission failed: ${(err as Error).message}`)
    } finally {
      state.chSubmitting = false
    }
  }

  /** Reads back whatever status is on record, no gateway calls. */
  async function refreshSubmissionStatus(id: string) {
    const res = await $fetch<{ row: SubmissionRowDto }>(`/api/submissions/${id}`)
    applySubmissionRow(res.row)
  }

  /** Polls HMRC for a still-processing submission — needs Gateway
   *  credentials again, same as the original submission. */
  async function pollHmrcStatus() {
    if (!state.submissionId) return
    const res = await $fetch<{ row: SubmissionRowDto }>('/api/hmrc/poll-ct600', {
      method: 'POST',
      body: { id: state.submissionId, gatewayUserId: f.gwUser, gatewayPassword: f.gwPass }
    })
    applySubmissionRow(res.row)
  }

  /** Polls Companies House for a still-processing submission — unlike
   *  pollHmrcStatus, needs no browser credentials (presenter identity is
   *  server-side, see poll-accounts.post.ts). */
  async function pollCompaniesHouseStatus() {
    if (!state.submissionId) return
    const res = await $fetch<{ row: SubmissionRowDto }>('/api/companies-house/poll-accounts', {
      method: 'POST',
      body: { id: state.submissionId, email: f.chEmail }
    })
    applySubmissionRow(res.row)
  }

  // --- Guided balance-sheet entry ---
  // Flattens GUIDED_BALANCE_FIELDS into current-year + comparative question
  // pairs, comparative only when firstPeriod !== 'yes'.
  const guidedSteps = computed(() => {
    const steps: Array<{ key: FieldKey; label: string; help: string; isComparative: boolean }> = []
    for (const field of GUIDED_BALANCE_FIELDS) {
      steps.push({ key: field.key, label: field.label, help: field.help, isComparative: false })
      if (field.comparativeKey && f.firstPeriod !== 'yes') {
        steps.push({ key: field.comparativeKey, label: field.label, help: field.help, isComparative: true })
      }
    }
    return steps
  })
  const guidedField = computed(() => guidedSteps.value[state.guidedIdx] ?? guidedSteps.value[0]!)
  const guidedTotal = computed(() => guidedSteps.value.length)
  function guidedNext() { if (state.guidedIdx < guidedTotal.value - 1) state.guidedIdx++ }
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
    balance, pnl, comparativeBalance, comparativePnl, taxableTotalProfits, rates, corporationTax, deadlines,
    eligibilityAnswers,
    capitalAllowanceRates, capitalAllowances,
    lossRelief,
    directorLoanRates, directorLoanAssessment, totalTaxPayable,
    comparativePeriod,
    problems, errorSteps, warnSteps, canSubmit, canContinue,
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

import { computed, reactive } from 'vue'
import type { FilingSelection } from '../domain/types'
import { balanceSheetTotals, profitAndLossTotals, parsePounds, formatPounds } from '../domain/accounting/totals'
import { ratesFor, calculateCorporationTax } from '../domain/tax/corporationTax'
import { calculateDeadlines } from '../domain/filing/deadlines'
import { findProblems, findMissingAmountFields, MICRO_ENTITY_TURNOVER_LIMIT } from '../domain/validation/problems'
import { createAuditEntry, buildTaxableProfitTrail, type AuditEntry, type AuditCategory } from '../domain/audit/auditTrail'
import { hashArtefacts, createApprovalRecord, isApprovalStale, type ApprovalRecord } from '../domain/filing/approval'
import type { GatewayReceipt } from '../domain/filing/submissionStatus'
import { computeIRmark, buildGovTalkEnvelope, type CtMessageClass } from '../domain/filing/govTalk'
import { generateAccountsIxbrl } from '../domain/ixbrl/accountsIxbrl'
import { generateTaxComputationIxbrl } from '../domain/ixbrl/taxComputationIxbrl'
import { diffFields, createAmendment, type Amendment } from '../domain/filing/amendments'

export type StepId =
  | 'start' | 'company' | 'period' | 'balance' | 'pnl' | 'tax' | 'notes' | 'review' | 'declaration' | 'receipt'

const STEP_LABELS: Record<StepId, string> = {
  start: 'Start',
  company: 'Company',
  period: 'Accounting period',
  balance: 'Balance sheet',
  pnl: 'Profit and loss',
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
    approver: '', approvalDate: '', declName: '', declRole: '', gwUser: '', gwPass: ''
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
    hmrcReceipt: null as GatewayReceipt | null,
    chReceipt: null as GatewayReceipt | null,
    submitting: false,
    submitError: '',
    amendments: [] as Amendment[]
  })

  const AMENDABLE_FIELD_LABELS: Record<string, string> = {
    turnover: 'Turnover', otherIncome: 'Other income', rawMaterials: 'Cost of raw materials',
    staffCosts: 'Staff costs', depreciation: 'Depreciation', otherCharges: 'Other charges',
    fixedAssets: 'Fixed assets', currentAssets: 'Current assets', retained: 'Retained earnings',
    addDepreciation: 'Depreciation added back', addEntertaining: 'Entertaining added back',
    capAllowances: 'Capital allowances'
  }

  /** requirements.md §31 — chains a new Amendment from a previously
   *  downloaded receipt (re-supplied by the user, since nothing persists
   *  server-side) against the current, in-progress figures. */
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
    const steps: StepId[] = ['start', 'company', 'period', 'balance', 'pnl']
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

  // --- HMRC submission (requirements.md §19; legacy GovTalk/XML gateway) ---
  async function submitToHmrc() {
    state.submitting = true
    state.submitError = ''
    try {
      const messageClass: CtMessageClass = state.testInLive ? 'HMRC-CT-CT600-TIL' : 'HMRC-CT-CT600'
      const bodyXml = `<CompanyTaxReturn><TaxComputation><![CDATA[${taxComputationIxbrl.value}]]></TaxComputation></CompanyTaxReturn>`
      const irMark = await computeIRmark(bodyXml)
      const envelopeXml = buildGovTalkEnvelope({
        messageClass,
        credentials: { gatewayUserId: f.gwUser, gatewayPassword: f.gwPass, vendorId: state.vendorId },
        companyUtr: f.utr, companyName: f.companyName, periodEnd: f.periodEnd,
        bodyXml, irMark
      })

      const res = await $fetch<{ ok: boolean; httpStatus: number; rawResponse: string }>('/api/hmrc/submit-ct600', {
        method: 'POST',
        body: { envelopeXml }
      })

      state.hmrcReceipt = {
        target: 'hmrc',
        status: res.ok ? 'submitted' : 'rejected',
        irMark,
        timestamp: new Date().toISOString(),
        rawResponse: res.rawResponse,
        message: res.ok ? `HTTP ${res.httpStatus} from HMRC gateway.` : `HMRC gateway returned HTTP ${res.httpStatus}.`
      }
      logEvent('submission', res.ok
        ? `Submitted to HMRC gateway (${messageClass}).`
        : `HMRC gateway submission failed with HTTP ${res.httpStatus}.`)
    } catch (err) {
      state.submitError = (err as Error).message || 'Could not reach the HMRC gateway.'
      state.hmrcReceipt = { target: 'hmrc', status: 'rejected', timestamp: new Date().toISOString(), message: state.submitError }
      logEvent('submission', `HMRC submission failed: ${state.submitError}`)
    } finally {
      state.submitting = false
    }
  }

  async function prepareCompaniesHouse() {
    try {
      const res = await $fetch<{ ok: boolean; channel: string; message: string }>('/api/companies-house/prepare-accounts', {
        method: 'POST',
        body: { accountsIxbrl: accountsIxbrl.value, companyNumber: f.companyNumber }
      })
      state.chReceipt = {
        target: 'companiesHouse',
        status: 'created',
        timestamp: new Date().toISOString(),
        message: res.message
      }
      logEvent('submission', 'Accounts iXBRL prepared for Companies House filing (no third-party accounts API is available yet).')
    } catch (err) {
      state.chReceipt = {
        target: 'companiesHouse', status: 'rejected', timestamp: new Date().toISOString(),
        message: (err as Error).message
      }
    }
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
    submitToHmrc, prepareCompaniesHouse,
    createAmendmentFromReceipt
  }
}

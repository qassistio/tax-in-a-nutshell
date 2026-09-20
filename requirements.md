# HMRC Corporation Tax + Companies House Filing Product
## Product Requirements for Very Small Companies / Micro-Entities

## 1. Product Goal

Build a deliberately narrow filing product for UK private limited companies that qualify as micro-entities.

The product should take a company from:

> "Here are my accounting figures"

to:

> "My statutory accounts have been filed with Companies House, my Corporation Tax return has been filed with HMRC, and I know how much tax is due and when."

The initial product should focus on straightforward owner-managed companies rather than attempting to support every UK accounting and Corporation Tax scenario.

---

## 2. Recommended Initial Scope

The first release should target companies with characteristics such as:

- UK private company limited by shares
- Micro-entity accounts under FRS 105
- Unaudited
- GBP functional and presentation currency
- One principal trade
- Normal accounting period of 12 months or less
- No group structure
- No overseas permanent establishments
- No controlled foreign companies
- No Patent Box claims
- No specialist creative-industry reliefs
- No complex R&D claims
- No complex investment-company activity
- No specialist financial instruments
- No complicated chargeable gains
- Ordinary business expenses
- Ordinary payroll costs
- Ordinary dividends
- Basic fixed assets
- Capital allowances
- Trading losses
- Director/shareholder loan accounts
- CT600A support where appropriate

The product should explicitly detect unsupported cases rather than silently attempting to process them.

---

# 3. Core Product Capabilities

## 3.1 Company Onboarding

The product should collect and manage:

- Company number
- Company name
- Registered office
- Corporation Tax UTR
- Companies House authentication information where required
- Accounting reference date
- Accounting period start and end dates
- Incorporation date
- Trading commencement date
- Directors
- Shareholders where required
- Share capital
- Previous accounting period details
- Previous filed accounts where relevant

Where possible, public company information should be retrieved automatically from Companies House rather than entered manually.

---

## 3.2 Eligibility Checking

Before allowing a filing to proceed, the product should determine whether the company is within the supported filing scope.

Checks should include:

- Micro-entity eligibility
- FRS 105 eligibility
- Audit exemption
- Company type
- Group membership
- Associated companies
- Accounting period length
- Overseas activities
- Specialist tax regimes
- Unsupported tax reliefs
- Unsupported accounting treatments
- Complex share structures
- Other circumstances requiring an accountant or more advanced filing software

The eligibility engine should run early in the process.

Users should not spend significant time preparing a return only to discover at the filing stage that the company cannot be supported.

---

# 4. Financial Data Input

The product should support several ways of providing accounting information.

## Minimum viable inputs

- Manual account balances
- Trial balance import
- CSV import
- XLSX import

## Possible future inputs

- Xero
- QuickBooks
- FreeAgent
- Sage
- Open Banking feeds
- Direct bank integrations
- Payroll integrations

The product does not need to become a full bookkeeping platform for the first release.

A year-end filing workflow based on an imported trial balance is sufficient.

---

# 5. Canonical Accounting Model

Regardless of the source data, imported accounts should be mapped into an internal canonical accounting model.

Typical canonical concepts include:

### Income

- Sales
- Service revenue
- Other operating income
- Bank interest
- Other interest
- Miscellaneous income

### Expenses

- Salaries
- Employer National Insurance
- Employer pension contributions
- Subcontractors
- Professional fees
- Accountancy fees
- Legal fees
- Software
- Hosting
- Telephone
- Internet
- Travel
- Motor expenses
- Insurance
- Rent
- Rates
- Repairs
- Advertising
- Entertainment
- Bank charges
- Interest
- Depreciation

### Assets

- Bank
- Cash
- Trade debtors
- Other debtors
- Prepayments
- Stock
- Computer equipment
- Fixtures and fittings
- Vehicles
- Other fixed assets

### Liabilities

- Trade creditors
- Accruals
- PAYE / NIC payable
- VAT payable
- Pension liabilities
- Corporation Tax payable
- Director loan accounts
- Other loans

### Equity

- Share capital
- Retained earnings
- Dividends
- Other reserves where supported

This canonical model should be independent from any specific bookkeeping provider.

---

# 6. Trial Balance Mapping

Imported account codes should be mapped to canonical accounting concepts.

For example:

```text
4000 - Consultancy Sales
    -> Revenue / Turnover

7201 - AWS
    -> Hosting / Software Costs

0050 - MacBook Equipment
    -> Computer Equipment

2100 - Director Loan
    -> Director Loan Account
```

The mapping system should support:

- Automatic suggestions
- User confirmation
- Persistent mappings
- Previous-year mappings
- Validation
- Reclassification
- Audit history

AI may assist with mapping suggestions, but the final filing data should be deterministic and reviewable.

---

# 7. Double-Entry Integrity

Even if users never see traditional bookkeeping terminology, the internal financial model should preserve accounting integrity.

The product should check that:

```text
Assets = Liabilities + Equity
```

It should also validate that:

```text
Total Debits = Total Credits
```

where a proper trial balance is supplied.

Invalid or incomplete financial data should be surfaced before accounts generation.

---

# 8. Year-End Adjustments

The product should support common year-end accounting adjustments.

These include:

- Accruals
- Prepayments
- Depreciation
- Stock adjustments
- Bad debt provisions where supported
- Trade debtor adjustments
- Trade creditor adjustments
- Payroll liabilities
- Pension liabilities
- VAT balances
- Corporation Tax accrual
- Dividends
- Director loan movements
- Fixed asset additions
- Fixed asset disposals
- Opening balance adjustments
- Prior-year corrections where supported

Each adjustment should have:

- Source
- Description
- Amount
- Accounting impact
- Tax impact
- User or system responsible
- Timestamp
- Audit history

---

# 9. Fixed Asset Register

The product should maintain a fixed asset register containing:

- Asset description
- Asset category
- Purchase date
- Original cost
- Depreciation method
- Depreciation rate
- Accumulated depreciation
- Net book value
- Disposal date
- Disposal proceeds
- Tax treatment
- Capital allowance category

Accounting depreciation and tax capital allowances must be treated separately.

For example:

```text
Accounting
Computer cost               £3,000
Depreciation                 £1,000

Tax
Accounting depreciation     +£1,000
Capital allowance           -£3,000
```

---

# 10. FRS 105 Statutory Accounts

The product should generate compliant micro-entity statutory accounts.

The accounts engine should support:

- Company information
- Accounting period
- Profit and loss account
- Balance sheet
- Required notes
- Accounting policies
- Comparative figures
- Director approval
- Director name
- Approval date
- Required micro-entity statements
- Audit exemption statements where applicable

The accounts should be generated from structured financial data rather than manually authored documents.

---

# 11. Comparative Figures

The product should support previous-year comparatives.

It should be possible to:

- Import previous accounts
- Enter previous-year balances manually
- Import a previous trial balance
- Reuse figures from a previous filing made using the product

First-year accounts need special treatment.

The product must also handle cases where statutory accounts cover more than 12 months but Corporation Tax requires more than one accounting period.

---

# 12. Accounting Profit to Taxable Profit

The tax engine should start with accounting profit and produce a transparent tax reconciliation.

Typical adjustments include:

- Depreciation add-back
- Non-deductible expenses
- Business entertaining
- Capital expenditure
- Capital allowances
- Disallowable legal expenses
- Non-business expenditure
- Other taxable income
- Interest income
- Loss relief
- Carried-forward losses

The user should be able to understand the calculation.

For example:

```text
Accounting profit before tax          £42,000

Add:
Depreciation                           £3,000
Business entertaining                    £500

Less:
Capital allowances                    £5,000

Taxable total profits                £40,500
```

---

# 13. Corporation Tax Calculation

The product should calculate Corporation Tax for the relevant accounting period.

The tax engine should support:

- Applicable Corporation Tax rates
- Small profits rate
- Main rate
- Marginal Relief
- Associated-company threshold adjustments
- Short accounting-period adjustments
- Periods spanning different financial years
- Taxable total profits
- Corporation Tax liability
- Amount already paid where applicable
- Amount remaining payable

Tax rules should be versioned by effective date.

Do not hard-code current tax assumptions throughout the application.

---

# 14. Trading Losses

The initial product should support common trading-loss scenarios.

Potential capabilities include:

- Current-period losses
- Carry forward
- Use against future trading profits
- Basic carry-back where supported
- Loss tracking by accounting period

Complex loss situations can initially be flagged as unsupported.

---

# 15. Director and Shareholder Loans

Owner-managed micro-companies commonly have director loan accounts.

The product should detect:

- Overdrawn director loans
- Loans to participators
- Loans repaid before filing
- Loans outstanding at relevant dates
- Potential Section 455 liabilities
- Situations requiring CT600A

The product should explain why additional tax may arise.

---

# 16. CT600 Generation

The system must generate the required Corporation Tax return.

It should populate fields including:

- Company information
- UTR
- Accounting period
- Turnover
- Trading profit or loss
- Taxable total profits
- Corporation Tax calculation
- Marginal Relief
- Tax payable
- Repayment information
- Relevant elections or declarations
- Required supplementary schedules

The CT600 model should be separate from the product UI.

---

# 17. CT600 Supplementary Pages

For the initial market, the most important likely supplementary page is:

- CT600A - Loans to participators

Other supplementary schedules should initially be unsupported unless deliberately added.

Examples of future capabilities may include:

- Chargeable gains
- Group and consortium relief
- Controlled foreign companies
- R&D
- Creative-industry relief
- Patent Box
- Restitution tax
- Specialist industry taxation

Unsupported supplementary-page requirements should stop filing before submission.

---

# 18. Human-Readable Tax Computation

The product should generate a tax computation that a user, accountant or HMRC reviewer can understand.

For example:

```text
Profit before taxation                 £42,000

Add back:
Depreciation                            £3,000
Business entertainment                    £500

Less:
Capital allowances                     £5,000

Taxable trading profit                £40,500

Other taxable income                       £0

Taxable total profits                 £40,500

Corporation Tax                       £X,XXX
```

The computation should reconcile exactly to the CT600.

---

# 19. iXBRL Accounts Generation

The statutory accounts need to be converted into valid iXBRL.

The generator should handle:

- Correct taxonomy
- Entity identifier
- Accounting periods
- XBRL contexts
- Currency units
- Numeric facts
- Non-numeric facts
- Required dimensions
- Accounting concepts
- Notes
- Appropriate tagging
- Hidden facts where required
- Validation

The iXBRL should be generated from structured accounting data.

AI should not dynamically guess filing tags during production filing.

---

# 20. iXBRL Tax Computation

The tax computation also needs an iXBRL representation.

This should include correctly tagged tax concepts such as:

- Accounting profit
- Adjustments
- Capital allowances
- Trading profit
- Taxable total profits
- Corporation Tax
- Reliefs
- Losses

The accounts taxonomy and Corporation Tax computation taxonomy should be treated as distinct domains.

---

# 21. Validation Pipeline

Validation should be treated as a major subsystem.

The pipeline should include:

```text
Financial validation
        ↓
Accounting validation
        ↓
Tax calculation validation
        ↓
XBRL validation
        ↓
HMRC XML schema validation
        ↓
HMRC business-rule validation
        ↓
Cross-document reconciliation
        ↓
Submission readiness
```

Examples of validation:

- Balance sheet balances
- Trial balance balances
- Required accounts fields present
- Current and comparative figures valid
- CT600 totals match tax computation
- Tax computation matches accounts
- Corporation Tax creditor reconciles where appropriate
- XBRL contexts are valid
- HMRC schema validation succeeds
- Required supplementary forms are present

---

# 22. Review Workflow

Users should be able to review everything before filing.

The review area should show:

- Statutory accounts
- Profit and loss
- Balance sheet
- Notes
- Corporation Tax computation
- CT600 summary
- Corporation Tax due
- Payment deadline
- Filing deadlines
- Warnings
- Unsupported conditions
- Changes since the last review

Users should review documents rather than raw technical XML.

---

# 23. Director Approval

Before submission, the product should record formal approval.

Store:

- Approving director
- Approval timestamp
- Accounts version
- Tax return version
- Declaration accepted
- Relevant legal wording/version
- Immutable hash of approved artefacts

A filing should not silently change after approval.

Any material change should invalidate the approval and require a new one.

---

# 24. HMRC Submission

The product must be able to submit the Company Tax Return to HMRC.

The submission subsystem should support:

- HMRC submission envelope
- CT600 XML
- Supplementary schedules
- iXBRL accounts attachment
- iXBRL tax computation attachment
- Required identifiers
- IRmark / HMRCmark handling
- Authentication
- Submission
- Polling where required
- Response handling
- Rejection handling
- Receipt storage

The product should distinguish between:

```text
Created
Validated
Approved
Queued
Submitted
Received
Accepted
Rejected
```

---

# 25. Companies House Submission

The statutory accounts should also be filed with Companies House.

The Companies House subsystem should support:

- Required company identifiers
- Filing authentication
- iXBRL accounts
- Submission
- Status checking
- Acceptance
- Rejection
- Receipt storage

HMRC and Companies House filing states should remain separate.

For example:

```text
HMRC
Accepted

Companies House
Rejected
```

must be a valid product state.

---

# 26. Different Filing Representations

The same accounting data may need different representations for:

- Internal accounts
- HMRC accounts
- Companies House filing
- Human-readable PDF/HTML preview

These should all derive from the same canonical accounting model.

Avoid maintaining four independent copies of the accounts.

---

# 27. Deadlines

The product should calculate and display relevant deadlines.

Examples include:

- Accounting period end
- Companies House filing deadline
- Corporation Tax payment deadline
- Corporation Tax return deadline
- Amendment deadline

The product should correctly handle:

- First accounts
- Long accounting periods
- Short accounting periods
- Changed accounting reference dates

---

# 28. Tax Payment Guidance

Once Corporation Tax is calculated, show:

- Corporation Tax amount
- Due date
- Payment reference
- How to pay
- Payment status if known
- Any interest or late-payment warnings where supported

The first version does not need to process payments itself.

A hand-off to HMRC payment services is sufficient.

---

# 29. Submission Receipts

Keep permanent records of:

- Submitted documents
- Submission timestamps
- HMRC response
- Companies House response
- Submission IDs
- IRmark / HMRCmark
- Payload hashes
- Approval records
- Tax calculation version
- Accounts rules version
- XBRL taxonomy version

The product should always be able to reproduce exactly what was filed.

---

# 30. Rejection Handling

HMRC and Companies House errors are often difficult for end users to interpret.

The product should translate technical errors into actionable messages.

Instead of:

```text
Error 1606: Element invalid against schema
```

prefer:

```text
Your accounting period end date does not match the period used in your statutory accounts.
```

Where possible:

- Identify the affected field
- Explain the issue
- Link directly to the relevant correction screen
- Re-run validation automatically after correction

---

# 31. Amendments

The system should keep every filed version immutable.

An amended filing should create:

```text
Original Return
    ↓
Amendment 1
    ↓
Amendment 2
```

rather than editing the original filing.

Track:

- Reason for amendment
- Previous values
- New values
- Tax difference
- Documents regenerated
- Approval
- Submission
- Acceptance

---

# 32. Audit Trail

Every figure should be traceable.

For example:

```text
CT600 Taxable Profit
£40,500
    ↓
Tax Computation
    ↓
Accounting Profit £42,000
+ Depreciation £3,000
+ Entertainment £500
- Capital Allowances £5,000
    ↓
Trial Balance
    ↓
Imported Ledger Accounts
```

The audit trail should cover:

- Imported data
- Mapping
- Adjustments
- Manual overrides
- Tax rules
- Generated documents
- Validation
- Approval
- Submission
- Amendments

---

# 33. Regulatory Versioning

The system should version regulatory artefacts.

Examples:

```text
AccountingRules
    FRS105-2026

CorporationTaxRules
    FY2026

CT600
    Version-X

FrcTaxonomy
    2026

HmrcRim
    Version-X

CompaniesHouseFiling
    Version-X
```

Every filing should store the exact versions used.

This prevents later regulatory changes from altering historic filings.

---

# 34. Unsupported-Case Engine

One of the most important capabilities is knowing when the product should stop.

Examples of possible unsupported conditions:

- Not eligible for FRS 105
- Audit required
- Parent company
- Subsidiary
- Group relief
- Controlled foreign company
- Foreign permanent establishment
- Foreign currency accounts
- Investment company
- Complex financial instruments
- R&D claims
- Patent Box
- Creative industry claims
- Complex chargeable gains
- Complex intangible assets
- Complex share structures
- Employee share schemes
- Specialist industry taxes
- Unusual related-party transactions
- Insolvency
- Liquidation
- Company restructuring
- Unsupported accounting policy

The system should explain:

1. What condition was detected
2. Why the product cannot support it
3. What the user should do next

---

# 35. Explainability

The product should explain accounting and tax decisions in plain English.

Example:

> Your accounts contain £2,300 of depreciation. Depreciation is an accounting expense but is not normally deducted directly when calculating Corporation Tax. We have therefore added the £2,300 back and claimed £3,100 of eligible capital allowances instead.

Users should be able to see both:

- What the software did
- Why it did it

---

# 36. Security

The product will handle highly sensitive business and tax data.

Security should include:

- Encryption at rest
- Encryption in transit
- Strong authentication
- Multi-factor authentication
- Fine-grained authorization
- Secrets management
- Credential rotation
- Secure HMRC credentials
- Secure Companies House credentials
- No secrets in logs
- Audit logging
- Immutable submission records
- Secure backups
- Data retention policies
- Data export
- Account deletion workflows

---

# 37. Suggested Domain Architecture

The application should be modular and technology-neutral.

A possible domain structure is:

```text
Company
│
├── Company Profile
├── Filing Eligibility
├── Accounting Periods
│
├── Financial Data
│   ├── Imports
│   ├── Ledger
│   ├── Trial Balance
│   └── Account Mapping
│
├── Year-End Adjustments
│
├── Fixed Assets
│
├── Statutory Accounts
│   ├── FRS 105
│   ├── Accounts Renderer
│   └── iXBRL Renderer
│
├── Corporation Tax
│   ├── Tax Adjustments
│   ├── Capital Allowances
│   ├── Losses
│   ├── Director Loans
│   ├── Tax Calculation
│   ├── CT600
│   ├── CT600A
│   └── Tax Computation
│
├── Validation
│   ├── Accounting
│   ├── Tax
│   ├── XBRL
│   ├── HMRC
│   └── Companies House
│
├── Approval
│
├── Filing
│   ├── HMRC
│   └── Companies House
│
└── Audit Trail
```

---

# 38. Suggested Nuxt-Oriented Application Shape

Using Nuxt does not require the accounting and tax logic to live in Vue components.

A sensible high-level shape could be:

```text
Nuxt Application
│
├── pages/
│   ├── companies/
│   ├── accounts/
│   ├── tax/
│   ├── review/
│   └── filings/
│
├── components/
│
├── server/
│   ├── api/
│   ├── services/
│   ├── repositories/
│   └── integrations/
│
├── domain/
│   ├── accounting/
│   ├── tax/
│   ├── xbrl/
│   ├── filings/
│   └── validation/
│
├── rules/
│   ├── accounting/
│   ├── corporation-tax/
│   └── eligibility/
│
├── integrations/
│   ├── hmrc/
│   └── companies-house/
│
└── tests/
```

The important architectural rule is:

> Vue/Nuxt UI code should present and orchestrate the filing process, not contain Corporation Tax calculation rules.

Tax, accounting, XBRL and filing logic should remain independently testable modules.

---

# 39. Suggested Filing Workflow

```text
Find Company
      ↓
Create Company Profile
      ↓
Eligibility Check
      ↓
Import Trial Balance
      ↓
Map Accounts
      ↓
Year-End Questions
      ↓
Apply Adjustments
      ↓
Review Trial Balance
      ↓
Generate FRS 105 Accounts
      ↓
Generate Tax Computation
      ↓
Generate CT600 / CT600A
      ↓
Generate iXBRL
      ↓
Run Validation
      ↓
Review Filing Pack
      ↓
Director Approval
      ↓
┌─────────────────────────┐
│ Submit to Companies House│
│ Submit to HMRC           │
└─────────────────────────┘
      ↓
Track Acceptance
      ↓
Show Corporation Tax Due
```

---

# 40. Suggested MVP Boundary

A strong MVP could include:

## Included

- Company lookup
- Company profile
- Micro-entity eligibility
- FRS 105
- Trial balance import
- Manual account entry
- Account mapping
- Basic year-end adjustments
- Fixed assets
- Depreciation
- Capital allowances
- Ordinary trading income
- Ordinary expenses
- Basic disallowable expenses
- Trading losses
- Dividends
- Director loans
- CT600
- CT600A
- Corporation Tax calculation
- Statutory accounts
- iXBRL accounts
- iXBRL tax computation
- HMRC validation
- Companies House validation
- Filing
- Filing status
- Receipts
- Audit history
- Amendments

## Explicitly Excluded Initially

- Groups
- Consolidated accounts
- R&D claims
- Patent Box
- Creative tax relief
- CFCs
- Foreign permanent establishments
- Foreign currency accounting
- Complex investment companies
- Complex chargeable gains
- Specialist financial instruments
- Audit-required companies
- Charities
- CIC-specific accounting where unsupported
- Insolvent companies
- Liquidations
- Complex restructures
- Specialist industries

---

# 41. Capability-Based Expansion

Future features should be represented as capabilities rather than gradually making one tax engine impossible to reason about.

For example:

```ts
interface FilingCapabilities {
  frs105: boolean
  tradingProfits: boolean
  capitalAllowances: boolean
  tradingLosses: boolean
  directorLoans: boolean
  chargeableGains: boolean
  researchAndDevelopment: boolean
  patentBox: boolean
  groups: boolean
  controlledForeignCompanies: boolean
  foreignPermanentEstablishment: boolean
}
```

An initial product might use:

```ts
const capabilities: FilingCapabilities = {
  frs105: true,
  tradingProfits: true,
  capitalAllowances: true,
  tradingLosses: true,
  directorLoans: true,

  chargeableGains: false,
  researchAndDevelopment: false,
  patentBox: false,
  groups: false,
  controlledForeignCompanies: false,
  foreignPermanentEstablishment: false,
}
```

This makes the support boundary explicit and testable.

---

# 42. Important Engineering Principles

## Deterministic filing

The actual return must be deterministic.

The same inputs and rule versions should produce the same:

- Accounts
- Tax computation
- CT600
- iXBRL
- Filing payload

## AI should assist, not decide

AI can help with:

- Account mapping suggestions
- Explaining tax concepts
- Categorisation suggestions
- Detecting potentially unusual transactions
- Helping users understand validation errors

AI should not be responsible for:

- Final tax calculations
- Production XBRL tags
- Eligibility decisions without deterministic validation
- Deciding which legal filing obligations apply
- Altering a return after approval

## Everything should reconcile

The following should agree:

```text
Ledger
   ↓
Trial Balance
   ↓
Statutory Accounts
   ↓
Tax Computation
   ↓
CT600
   ↓
HMRC Filing
```

## Everything should be versioned

No filing should depend on a concept of simply:

```text
currentTaxRules
```

Instead:

```text
rulesFor(accountingPeriod)
```

should return the applicable ruleset.

## Everything filed should be reproducible

Given:

- Source data
- Adjustments
- Rule versions
- Taxonomy versions
- Filing versions

the application should always be capable of regenerating the exact submitted artefacts.

---

# 43. Product Positioning

The first version should not try to compete with complete accounting platforms.

A stronger product proposition is:

> Upload your trial balance, answer a small number of year-end questions, review your accounts and Corporation Tax calculation, then file directly with Companies House and HMRC.

That keeps the initial problem focused on:

- Year-end accounts
- Tax
- Compliance
- Filing

rather than:

- Daily bookkeeping
- Invoice creation
- Expense capture
- Payroll
- Bank reconciliation
- CRM
- Inventory
- Full accounting-suite functionality

Those can be integrated later where useful.

---

# 44. End-State User Experience

A successful filing should feel approximately like this:

```text
Acme Software Ltd
Year ended 31 December 2026

Accounts
✓ Complete

Corporation Tax Return
✓ Complete

Companies House
✓ Filed and accepted

HMRC
✓ Filed and accepted

Corporation Tax due
£8,214.37

Payment deadline
1 October 2027
```

Behind that simple interface should be a strongly validated, versioned and auditable accounting and tax system.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TaxInANutshell: a Nuxt 4 (Vue 3, `ssr: false`) single-page wizard that takes a UK micro-entity company from
typed-in accounting figures to a filed CT600 (HMRC) and FRS 105 statutory accounts (Companies House). See
`requirements.md` for the full original product vision — **but treat it as aspirational, not as a description
of this codebase**. The team deliberately scoped the actual build down to "type in your aggregate totals, get
FRS105 accounts + a CT600", and rejected building out `requirements.md`'s canonical accounting model, ledger,
fixed-asset register, account-mapping subsystem, and multi-stage validation pipeline as scope creep. When a
`requirements.md` section implies one of those subsystems, the real implementation instead uses a handful of
typed aggregate number fields plus a pure formula — do not "complete" a gap by building the general subsystem
`requirements.md` describes.

## Commands

```bash
npm run dev          # dev server, http://localhost:3000
npm run build         # nuxt build
npm test              # vitest run (domain + server tests only, see vitest.config.ts)
npx vitest run <path>          # run a single test file
npx vitest run -t "<name>"     # run tests matching a name
npx vue-tsc --noEmit  # typecheck the whole app — run this after any change, not just npm run build
```

There's no lint script configured. After any change, run `npx vue-tsc --noEmit` and `npm test` — both should
stay clean; this is the project's normal verification pattern.

Tests only cover `app/domain/**/*.test.ts` and `server/**/*.test.ts` (see `vitest.config.ts`) — Vue components
have no test coverage, by design, since UI code should contain no logic worth unit testing (see architecture
below).

## Architecture

### The one hard rule: domain logic is Vue-free

`app/domain/**` is plain, framework-free TypeScript — no Vue imports, nothing reactive. This is why it can be
unit tested with `vitest` directly (`environment: 'node'`, no Nuxt/Vue plugin needed) and why `vitest.config.ts`
only points at `app/domain/**` and `server/**`. `app/composables/useFilingWizard.ts` is the *only* place that
wires domain functions into Vue reactivity (wrapping them in `computed()`), and Vue components
(`app/components/Step*.vue`) only bind to `useFilingWizard()`'s output and call its actions — they never call
domain functions directly or contain tax/accounting rules themselves.

Every `Step*.vue` component receives `wizard: ReturnType<typeof useFilingWizard>` as a single prop and follows
the same shape: a `.step-kicker`/`h2` header, `.amount-row` fields bound to `wizard.f.<field>`, and a
`.step-footer` with `wizard.move(-1)`/`wizard.move(1)` buttons. `app/app.vue` maps `StepId` to components via a
`stepComponents` record (plain object, not Nuxt auto-imports — `<component :is>` needs a real component
definition) and drives the step nav from `wizard.order`/`wizard.stepStatus`/`wizard.isStepUnlocked`.

### `useFilingWizard.ts` — the composable everything flows through

One flat `reactive()` object `f` holds every form field as a **string** (matching real form input, not
pre-parsed) — `parsePounds()` converts to a number only inside `computed()`s. Nothing in `f` is pre-filled.
Key derived state, all `computed()`:
- `order` — the step sequence, conditionally including `comparatives` (only when `f.firstPeriod !== 'yes'`),
  `chSubmit`/`tax` (only when those filings are selected in `state.filings`).
- `problems` — the single source of truth for validation, aggregating `findEligibilityProblems()`,
  `findMissingAmountFields()`, and `findProblems()`. Every `FilingProblem` has a `step`, so the Review screen
  can link straight to the field that needs fixing.
- `stepOwnFieldsFilled(step)` / `unlockedSteps` — gates step nav; "filled" means *answered*, not *passing* (an
  eligibility failure still unlocks later steps so the user can review the whole flow, but blocks `canSubmit`).
- `capitalAllowances`, `lossRelief`, `directorLoanAssessment`, `taxableTotalProfits`, `corporationTax`,
  `totalTaxPayable` — the tax computation chain, each depending on the previous (capital allowances → trading
  result → loss relief → taxable total profits → Corporation Tax → total tax payable including any s.455).
- `accountsIxbrl` / `taxComputationIxbrl` — generate the actual filed documents from the current `f` state.

### Versioned-rules pattern (`requirements.md` §33/§42)

Every rate/threshold lives behind a function named `xFor(periodEndDate)` — e.g. `ratesFor`,
`capitalAllowanceRatesFor`, `directorLoanRatesFor`, `accountsTaxonomyFor`, `ctTaxonomyFor` — that currently
always returns one hard-coded constant set, but is structured so a real "look up the rules that applied on
this date" implementation can be dropped in later without touching call sites. **Never** inline a rate/threshold
literal directly in a calculation — add it to the relevant `RatesFor` module instead, even if only one version
will ever exist for now.

### iXBRL generation (`app/domain/ixbrl/`)

`accountsIxbrl.ts` and `taxComputationIxbrl.ts` build the filed documents as template-literal XHTML+inline-XBRL
strings (`ix:nonFraction` facts, `xbrli:context`/`xbrli:unit` in a hidden header). `taxonomy.ts` centralizes the
real, manually-verified namespace/schemaRef/element-name choices — see its header comment for the taxonomy
versions checked and the explicit caveat that this was a one-off manual check, not automated or independently
reviewed; re-verify before any real filing. Both generators take an optional extra input (`comparative` /
`lossesRelieved` + `directorLoan`) that only renders extra context blocks/facts when supplied, so existing
callers and existing tests don't need to change when a new optional feature is added — follow this pattern for
future extensions rather than making these functions' required inputs grow.

### Server (`server/api/`, `server/utils/`)

The app is `ssr: false` and stores nothing server-side except **submission status**. `server/utils/db.ts` /
`schema.ts` hold the one deliberate exception: a SQLite `submissions` table (via Node's built-in `node:sqlite`,
wired through Drizzle's `sqlite-proxy` driver — `better-sqlite3` was tried and rejected because it needs a
native build toolchain) storing gateway status metadata keyed by a GUID, so a results page can be reloaded —
never any accounting figures or company financials. Two distinct external gateways are involved and their
statuses (`hmrc_*` / `ch_*` columns) are tracked independently:
- HMRC's legacy GovTalk/XML CT600 gateway (`server/api/hmrc/*`) — IRmark computed server-side (needs a real
  XML DOM/C14N library), Government Gateway credentials supplied per-request from the browser, never stored.
- Companies House's XML Gateway for accounts (`server/api/companies-house/submit-accounts.post.ts`,
  `poll-accounts.post.ts`) — uses TaxInANutshell's own presenter credentials (`NUXT_COMPANIES_HOUSE_PRESENTER_*`
  env vars, server-side only), distinguished from Companies House's separate, unrelated public read-only
  company-lookup REST API (`search.get.ts`, `company/[number].get.ts`, `NUXT_COMPANIES_HOUSE_API_KEY`) used
  only to prefill company details.

### Validation (`app/domain/validation/problems.ts`)

`REQUIRED_AMOUNT_FIELDS` is the single source of truth for which typed amount fields are mandatory per step —
both `findMissingAmountFields()` and `useFilingWizard.ts`'s `stepOwnFieldsFilled()` read it, so adding a new
required field is a one-line addition here (a blank field is always an error, even for a legitimately-zero
figure — nil must be typed, never assumed). `findProblems()` covers everything else (balance sheet balancing,
UTR format, turnover threshold, etc.) and returns the same `FilingProblem { id, sev, step, title, detail }`
shape used everywhere else in the validation/eligibility pipeline.

### Audit trail (`app/domain/audit/auditTrail.ts`)

In-memory only, never persisted (consistent with "nothing stored until you submit"). `buildTaxableProfitTrail()`
reconstructs the worked "taxable profit traced back to accounting profit" example from `requirements.md` §32 —
extend it by adding new *optional* input fields that only push an extra trail step when truthy, so existing
tests asserting on step count don't need to change.

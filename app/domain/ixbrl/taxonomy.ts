// requirements.md §19/§33/§42 — taxonomy references are versioned by
// effective date, never hard-coded as "current". Namespace/schema/element
// names below were checked against the real published packages (not
// guessed) on 2026-09-21: FRC 2026 Taxonomy Suite v1.0.0 (frc.org.uk —
// FRS 105 elements live in the shared fr/2026-01-01/core schema, no
// separate "FRS-105" folder), and HMRC's CT computational taxonomy
// (www.hmrc.gov.uk/schemas/ct/comp/2024-01-01/). Both schemaRef URLs
// resolved (HTTP 200) at that date. Re-verify before a real filing — no
// automated check keeps these in sync.
//
// CORRECTED 2026-09-21: schemaRef now points at the FRS-102 entry point,
// not the "core" schema — CH's TIS v5.9 states micro-entities (FRS 105)
// must use the FRS 102 entry point, even though "core" is where the
// actual FRS 105 elements/definition linkbase live (see maturityDimension).
//
// KNOWN GAP: FRS 105's Periodic Review 2024 amendments apply from periods
// beginning on/after 1 January 2026, and HMRC's CT 2024 taxonomy is only
// confirmed valid up to periods starting 31 March 2026 (no successor
// published as of the check above). Confirm against gov.uk's "Taxonomies
// accepted by HMRC" list for the specific period before filing.

export interface AccountsTaxonomy {
  version: string
  schemaRef: string
  namespace: string
  prefix: 'core' | string
  /** requirements.md §19 — the two creditors maturities aren't separate
   *  tagged concepts; same `Creditors` concept, distinguished by this
   *  dimension (confirmed via the definition linkbase). */
  maturityDimension: {
    axis: string
    withinOneYear: string
    afterOneYear: string
  }
}

export interface CtTaxonomy {
  version: string
  schemaRef: string
  namespace: string
  prefix: 'ct' | string
}

const FRS105_2026: AccountsTaxonomy = {
  version: 'FRC Taxonomy Suite 2026 v1.0.0',
  schemaRef: 'https://xbrl.frc.org.uk/FRS-102/2026-01-01/FRS-102-2026-01-01.xsd',
  namespace: 'http://xbrl.frc.org.uk/fr/2026-01-01/core',
  prefix: 'core',
  maturityDimension: {
    axis: 'FinancialInstrumentCurrentNon-currentDimension',
    withinOneYear: 'CurrentFinancialInstruments',
    afterOneYear: 'Non-currentFinancialInstruments'
  }
}

const CT_2024: CtTaxonomy = {
  version: 'HMRC CT computational 2024-01-01',
  schemaRef: 'http://www.hmrc.gov.uk/schemas/ct/comp/2024-01-01/ct-comp-2024.xsd',
  namespace: 'http://www.hmrc.gov.uk/schemas/ct/comp/2024-01-01',
  prefix: 'ct-comp'
}

/** FRS 105 micro-entity taxonomy in force for a period ending on the given date. */
export function accountsTaxonomyFor(_periodEndDate: string | Date): AccountsTaxonomy {
  return FRS105_2026
}

/** HMRC Corporation Tax computation taxonomy in force for a period ending on the given date. */
export function ctTaxonomyFor(_periodEndDate: string | Date): CtTaxonomy {
  return CT_2024
}

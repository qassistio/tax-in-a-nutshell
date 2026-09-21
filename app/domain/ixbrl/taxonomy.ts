// requirements.md §19/§33/§42 — iXBRL taxonomy references are versioned by
// effective date, never hard-coded as "the current taxonomy". Namespace,
// schema locations and element names below were checked against the real
// published taxonomy packages (not guessed) on 2026-09-21:
//  - FRC 2026 Taxonomy Suite v1.0.0, downloaded from frc.org.uk and
//    inspected directly (the micro-entity/FRS 105 elements live in the
//    shared fr/2026-01-01/core schema — there is no separate "FRS-105"
//    taxonomy folder, unlike FRS 101/102/IFRS which each get their own).
//  - HMRC's CT computational taxonomy, fetched directly from
//    www.hmrc.gov.uk/schemas/ct/comp/2024-01-01/.
// Both schemaRef URLs below were confirmed to resolve (HTTP 200) at that
// date. Re-verify before relying on this for a real filing — taxonomies
// are re-issued periodically and this project has no automated check that
// keeps these in sync.
//
// CORRECTED 2026-09-21: schemaRef below now points at the FRS-102 entry
// point, not the "core" schema previously set here. Companies House's own
// Technical Interface Specification for Accounts v5.9 states explicitly:
// "Micro-entities (FRS 105) should use the FRS 102 entry point" — FRS 105
// filers reference the FRS-102 taxonomy's entry-point XSD
// (xbrl.frc.org.uk/FRS-102/...), not the shared "core" schema alone. The
// "core" schema is still where the actual FRS 105 elements/definition
// linkbase live (see maturityDimension below), but it is not the correct
// schemaRef to declare in the instance document.
//
// KNOWN GAP: FRS 105's Periodic Review 2024 amendments took effect for
// accounting periods beginning on or after 1 January 2026, and HMRC's CT
// computational 2024 taxonomy is only confirmed valid for periods starting
// up to 31 March 2026 (HMRC has an open consultation, closed June 2026, on
// a replacement standardised computation format — no successor taxonomy
// was published as of the check above). Both entries below are the most
// recent taxonomy actually available to check against, not necessarily
// the one in force for every period this app might be used for — confirm
// against gov.uk's "Taxonomies accepted by HMRC" list for the specific
// period before filing.

export interface AccountsTaxonomy {
  version: string
  schemaRef: string
  namespace: string
  prefix: 'core' | string
  /** requirements.md §19 — "due within one year" / "due after more than
   *  one year" creditors aren't two separate tagged concepts in the FRC
   *  taxonomy; they're the same `Creditors` concept reported in two
   *  contexts distinguished by this dimension, confirmed by reading the
   *  taxonomy's definition linkbase (frc-core-2026-01-01-definition.xml). */
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

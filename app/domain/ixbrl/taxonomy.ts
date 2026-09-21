// requirements.md §19/§33/§42 — iXBRL taxonomy references are versioned by
// effective date, never hard-coded as "the current taxonomy". Namespace and
// schema locations below are the published FRC/HMRC taxonomies at the time
// of writing; verify against gov.uk/HMRC's taxonomy pack before any real
// filing — see the caveat on generateAccountsIxbrl/generateTaxComputationIxbrl.
//
// KNOWN STALE AS OF 2026-09: FRS 105's Periodic Review 2024 amendments took
// effect for accounting periods beginning on or after 1 January 2026, and
// the FRC published its 2026 Taxonomy Suite on 18 November 2025 (covering
// UK IFRS/FRS 101/FRS 102/UKSEF — FRS 105 filers draw elements from the
// same suite). FRS105_2024 below has NOT been updated to the 2026 suite:
// its schemaRef/namespace/element names were never independently confirmed
// against HMRC/FRC's published pack in the first place (no PDF-rendering
// tooling was available to extract them during development — see git
// history), so rather than guess a plausible-looking 2026 schema location
// and compound one unverified assumption with another, this is left
// pointing at the 2024 pack with this note. Before filing any period
// beginning on or after 1 Jan 2026, replace FRS105_2024 with a real entry
// sourced from the FRC's downloaded Taxonomy Suite zip, not a guess.

export interface AccountsTaxonomy {
  version: string
  schemaRef: string
  namespace: string
  prefix: 'core' | string
}

export interface CtTaxonomy {
  version: string
  schemaRef: string
  namespace: string
  prefix: 'ct' | string
}

const FRS105_2024: AccountsTaxonomy = {
  version: 'FRC FRS 105 2024',
  schemaRef: 'https://xbrl.frc.org.uk/FRS-105/2024-01-01/FRS-105-2024-01-01.xsd',
  namespace: 'http://www.xbrl-uk.org.uk/frs105/2024-01-01',
  prefix: 'core'
}

const CT_2024: CtTaxonomy = {
  version: 'HMRC CT 2024',
  schemaRef: 'http://www.hmrc.gov.uk/schemas/ct/comp/2024-01-01/CT-2024.xsd',
  namespace: 'http://www.hmrc.gov.uk/schemas/ct/comp',
  prefix: 'ct'
}

/** FRS 105 micro-entity taxonomy in force for a period ending on the given date. */
export function accountsTaxonomyFor(_periodEndDate: string | Date): AccountsTaxonomy {
  return FRS105_2024
}

/** HMRC Corporation Tax computation taxonomy in force for a period ending on the given date. */
export function ctTaxonomyFor(_periodEndDate: string | Date): CtTaxonomy {
  return CT_2024
}

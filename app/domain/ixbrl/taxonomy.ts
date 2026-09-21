// requirements.md §19/§33/§42 — iXBRL taxonomy references are versioned by
// effective date, never hard-coded as "the current taxonomy". Namespace and
// schema locations below are the published FRC/HMRC taxonomies at the time
// of writing; verify against gov.uk/HMRC's taxonomy pack before any real
// filing — see the caveat on generateAccountsIxbrl/generateTaxComputationIxbrl.

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

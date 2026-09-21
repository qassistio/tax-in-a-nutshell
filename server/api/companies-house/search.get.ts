// Companies House's Public Data API — a separate CH product from the XML
// Gateway used elsewhere here: free, read-only REST, authenticated with
// its own API key (HTTP Basic, key as username, blank password). Backs
// company search on StepCompany.vue (requirements.md §3.1); see
// company/[number].get.ts for the follow-up lookup that prefills the form.
//
// TaxInANutshell's own API key, not a filer secret — read from a server env var.

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  if (!q) throw createError({ statusCode: 400, statusMessage: 'Missing q' })

  const config = useRuntimeConfig()
  if (!config.companiesHouseApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Companies House API key is not configured on this server (NUXT_COMPANIES_HOUSE_API_KEY)'
    })
  }

  const response = await fetch(
    `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=10`,
    { headers: { Authorization: `Basic ${Buffer.from(`${config.companiesHouseApiKey}:`).toString('base64')}` } }
  )
  if (!response.ok) {
    throw createError({ statusCode: response.status, statusMessage: `Companies House search failed (HTTP ${response.status})` })
  }

  const data = await response.json() as {
    items?: Array<{ title: string; company_number: string; company_status?: string; address_snippet?: string }>
  }
  return {
    results: (data.items ?? []).map(item => ({
      companyNumber: item.company_number,
      companyName: item.title,
      status: item.company_status,
      addressSnippet: item.address_snippet
    }))
  }
})

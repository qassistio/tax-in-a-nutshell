// Companies House's Public Data API (api.company-information.service.gov.uk)
// — a completely separate CH product from the XML Gateway used elsewhere
// under server/api/companies-house/: this is the free, read-only REST API
// for searching public company records, authenticated with its own API
// key (HTTP Basic, the key as username, a blank password — see
// https://developer-specs.company-information.service.gov.uk/). Backs the
// company search on StepCompany.vue, so the filer can find their company
// by name rather than typing the number in from memory — see
// company/[number].get.ts for the follow-up lookup that actually prefills
// the form (requirements.md §3.1: "Where possible, public company
// information should be retrieved automatically from Companies House
// rather than entered manually").
//
// TaxInANutshell's own API key, not a filer secret — read from a server
// env var, same reasoning as the XML Gateway presenter credentials.

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

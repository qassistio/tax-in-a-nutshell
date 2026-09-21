// Companies House Public Data API company profile lookup — the follow-up
// to search.get.ts (see its module comment for the API/credential
// details). Returns the fields StepCompany.vue can actually prefill from
// a public record: name, registered office address, and the primary SIC
// code. The UTR isn't public data (it's an HMRC identifier, not a
// Companies House one) so that still has to be typed in — everything
// else the requirement asks for automated, this covers.

export default defineEventHandler(async (event) => {
  const number = getRouterParam(event, 'number')
  if (!number) throw createError({ statusCode: 400, statusMessage: 'Missing company number' })

  const config = useRuntimeConfig()
  if (!config.companiesHouseApiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Companies House API key is not configured on this server (NUXT_COMPANIES_HOUSE_API_KEY)'
    })
  }

  const response = await fetch(`https://api.company-information.service.gov.uk/company/${encodeURIComponent(number)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${config.companiesHouseApiKey}:`).toString('base64')}` }
  })
  if (response.status === 404) throw createError({ statusCode: 404, statusMessage: 'No company found with that number' })
  if (!response.ok) {
    throw createError({ statusCode: response.status, statusMessage: `Companies House lookup failed (HTTP ${response.status})` })
  }

  const data = await response.json() as {
    company_name: string
    company_number: string
    sic_codes?: string[]
    registered_office_address?: {
      address_line_1?: string
      address_line_2?: string
      locality?: string
      region?: string
      postal_code?: string
      country?: string
    }
  }
  const addr = data.registered_office_address ?? {}
  const addressLines = [addr.address_line_1, addr.address_line_2, addr.locality, addr.region].filter(Boolean)

  return {
    companyName: data.company_name,
    companyNumber: data.company_number,
    address: addressLines.join(', '),
    postcode: addr.postal_code ?? '',
    sic: data.sic_codes?.[0] ?? ''
  }
})

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Nothing here is ever stored server-side, and nothing typed into the
  // return — company figures, gateway credentials — should ever pass
  // through a server render. The whole app runs client-side only.
  ssr: false,

  css: ['~/assets/css/broadsheet.css'],

  // Server-side only: the HMRC vendor ID identifies this piece of
  // software to the gateway, it is not a user secret. Government Gateway
  // credentials and the constructed submission body are supplied
  // per-request from the browser and never stored — see
  // server/api/hmrc/submit-ct600.post.ts.
  // Overridable via NUXT_HMRC_VENDOR_ID / NUXT_HMRC_GATEWAY_URL env vars —
  // Nuxt maps runtimeConfig keys to NUXT_<KEY> automatically.
  runtimeConfig: {
    hmrcVendorId: '',
    hmrcGatewayUrl: 'https://transaction-engine.tax.service.gov.uk/submission',
    // Companies House XML Gateway — same URL for test and live traffic;
    // see app/domain/filing/companiesHouseGovTalk.ts for how the two are
    // distinguished (a <GatewayTest> flag, not a different URL or Class).
    companiesHouseGatewayUrl: 'https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway',
    // TaxInANutshell's own Companies House Software Filing credentials —
    // these identify this software to the gateway (like an OAuth client
    // ID/secret), not the filer, so unlike the Company Authentication
    // Code they are never entered in the browser or sent to it. Set via
    // NUXT_COMPANIES_HOUSE_PRESENTER_ID / _PRESENTER_AUTH_CODE /
    // _PACKAGE_REFERENCE env vars — see
    // server/api/companies-house/submit-accounts.post.ts and
    // poll-accounts.post.ts, the only places that read them.
    companiesHousePresenterId: '',
    companiesHousePresenterAuthCode: '',
    companiesHousePackageReference: '',
    // Companies House's separate Public Data API (api.company-information
    // .service.gov.uk) — a free, read-only REST API for looking up public
    // company records, entirely distinct from the XML Gateway above (its
    // own registration, its own key, HTTP Basic with the key as username
    // and a blank password). Used to prefill company details rather than
    // have the filer type them in — requirements.md §3.1. Set via
    // NUXT_COMPANIES_HOUSE_API_KEY — see
    // server/api/companies-house/search.get.ts and company/[number].get.ts.
    companiesHouseApiKey: ''
  },

  app: {
    head: {
      title: 'TaxInANutshell',
      meta: [
        { name: 'description', content: 'Micro-entity accounts and Company Tax Return filing, held in your browser only.' }
      ],
      link: [
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap' },
        { rel: 'icon', type: 'image/png', href: '/assets/icons/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/assets/icons/favicon.svg' },
        { rel: 'shortcut icon', href: '/assets/icons/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/assets/icons/apple-touch-icon.png' },
        { rel: 'manifest', href: '/assets/icons/site.webmanifest' }
      ]
    }
  }
})

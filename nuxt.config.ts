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
    companiesHouseGatewayUrl: 'https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway'
  },

  app: {
    head: {
      title: 'TaxInANutshell',
      meta: [
        { name: 'description', content: 'Micro-entity accounts and Company Tax Return filing, held in your browser only.' }
      ],
      link: [
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap' }
      ]
    }
  }
})

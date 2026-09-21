// https://nuxt.com/docs/api/configuration/nuxt-config
// The canonical production origin — used to build absolute URLs for
// canonical links, Open Graph/Twitter tags, and public/sitemap.xml.
// Overridable via NUXT_PUBLIC_SITE_URL if that ever changes.
const SITE_URL = process.env.NUXT_PUBLIC_SITE_URL || 'https://taxinanutshell.co.uk'

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
    // Whether CT600 submissions use HMRC's Test-In-Live message class
    // (HMRC-CT-CT600-TIL) or the real live one (HMRC-CT-CT600) —
    // deliberately a server-only switch (NUXT_HMRC_TEST_IN_LIVE), not a
    // filer-facing dropdown, same reasoning and default ('true') as
    // companiesHouseGatewayTest below. See submit-ct600.post.ts, the only
    // place that reads it — the envelope (and this Class element) is now
    // built there rather than in the browser, so the choice can't be
    // overridden client-side.
    hmrcTestInLive: true,
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
    // Whether submissions carry the XML Gateway's <GatewayTest> flag —
    // deliberately a server-only switch (NUXT_COMPANIES_HOUSE_GATEWAY_TEST),
    // not a filer-facing dropdown: which presenter credentials are
    // configured above already determines whether this software is even
    // registered for live filing, so the safe default is 'true' and an
    // operator has to deliberately flip it in the deployment's own env
    // vars to go live, rather than a filer being able to pick "Live" by
    // mistake in the browser. See submit-accounts.post.ts/
    // poll-accounts.post.ts, the only places that read it.
    companiesHouseGatewayTest: true,
    // Companies House's separate Public Data API (api.company-information
    // .service.gov.uk) — a free, read-only REST API for looking up public
    // company records, entirely distinct from the XML Gateway above (its
    // own registration, its own key, HTTP Basic with the key as username
    // and a blank password). Used to prefill company details rather than
    // have the filer type them in — requirements.md §3.1. Set via
    // NUXT_COMPANIES_HOUSE_API_KEY — see
    // server/api/companies-house/search.get.ts and company/[number].get.ts.
    companiesHouseApiKey: '',

    // Where the one server-side table (see server/utils/db.ts) lives.
    // Locally this is a plain SQLite file on disk. In production this app
    // is hosted on Vercel, whose serverless functions have no persistent
    // filesystem — a local file there would silently reset every cold
    // start — so NUXT_TURSO_DATABASE_URL/_AUTH_TOKEN must be set to a
    // remote libSQL (Turso) database instead; server/utils/db.ts refuses
    // to fall back to a local file when running on Vercel. dbPath is
    // unused whenever tursoDatabaseUrl is set.
    dbPath: './.data/submissions.sqlite',
    tursoDatabaseUrl: '',
    tursoAuthToken: '',

    // Public — readable in the browser, unlike everything above.
    public: {
      siteUrl: SITE_URL
    }
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en-GB' },
      // No pages/ router — this is a single-screen wizard (app/app.vue) —
      // so there's no per-page title to template; the full descriptive
      // title lives here rather than behind a titleTemplate suffix.
      title: 'TaxInANutshell — File your Company Tax Return & micro-entity accounts',
      meta: [
        { name: 'description', content: 'File your UK Company Tax Return (CT600) and FRS 105 micro-entity accounts straight to HMRC and Companies House — free, no accountant or filing software to buy, done in your browser in one sitting.' },
        { name: 'robots', content: 'index, follow' },
        { name: 'theme-color', content: '#ffffff' },

        // Open Graph — used by Facebook, LinkedIn, Slack, WhatsApp, etc.
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'TaxInANutshell' },
        { property: 'og:title', content: 'TaxInANutshell — File your Company Tax Return & micro-entity accounts' },
        { property: 'og:description', content: 'File your UK Company Tax Return (CT600) and FRS 105 micro-entity accounts straight to HMRC and Companies House — free, no accountant or filing software to buy, done in your browser in one sitting.' },
        { property: 'og:url', content: SITE_URL },
        { property: 'og:image', content: `${SITE_URL}/assets/icons/web-app-manifest-512x512.png` },
        { property: 'og:locale', content: 'en_GB' },

        // Twitter/X card — falls back to the Open Graph tags above for
        // everything except card type, so kept minimal.
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: 'TaxInANutshell — File your Company Tax Return & micro-entity accounts' },
        { name: 'twitter:description', content: 'File your UK Company Tax Return (CT600) and FRS 105 micro-entity accounts straight to HMRC and Companies House — free.' },
        { name: 'twitter:image', content: `${SITE_URL}/assets/icons/web-app-manifest-512x512.png` }
      ],
      link: [
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&display=swap' },
        { rel: 'icon', type: 'image/png', href: '/assets/icons/favicon-96x96.png', sizes: '96x96' },
        { rel: 'icon', type: 'image/svg+xml', href: '/assets/icons/favicon.svg' },
        { rel: 'shortcut icon', href: '/assets/icons/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/assets/icons/apple-touch-icon.png' },
        { rel: 'manifest', href: '/assets/icons/site.webmanifest' },
        { rel: 'canonical', href: SITE_URL }
      ],
      script: [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'TaxInANutshell',
            url: SITE_URL,
            description: 'File your UK Company Tax Return (CT600) and FRS 105 micro-entity accounts straight to HMRC and Companies House — free, no accountant or filing software to buy, done in your browser in one sitting.',
            applicationCategory: 'FinanceApplication',
            operatingSystem: 'Any (web browser)',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'GBP'
            },
            publisher: {
              '@type': 'Organization',
              name: 'QAssist',
              url: 'https://qassist.io'
            }
          })
        }
      ]
    }
  }
})

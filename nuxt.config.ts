// https://nuxt.com/docs/api/configuration/nuxt-config
// Canonical production origin for canonical links, OG/Twitter tags,
// sitemap.xml. Overridable via NUXT_PUBLIC_SITE_URL.
const SITE_URL = process.env.NUXT_PUBLIC_SITE_URL || 'https://taxinanutshell.co.uk'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Nothing typed into the return (figures, credentials) should ever pass
  // through a server render — the whole app runs client-side only.
  ssr: false,

  css: ['~/assets/css/broadsheet.css'],

  // Private keys below are server-only and map to NUXT_<KEY> env vars
  // automatically. Government Gateway credentials/submission bodies are
  // supplied per-request from the browser and never stored (see
  // server/api/hmrc/submit-ct600.post.ts).
  runtimeConfig: {
    hmrcVendorId: '',
    hmrcGatewayUrl: 'https://transaction-engine.tax.service.gov.uk/submission',
    // Test-In-Live (HMRC-CT-CT600-TIL) vs live (HMRC-CT-CT600) message
    // class — server-only switch, not filer-facing, so it can't be
    // overridden client-side. Read only by submit-ct600.post.ts.
    hmrcTestInLive: true,
    // Companies House XML Gateway — same URL for test/live, distinguished
    // by a <GatewayTest> flag (see companiesHouseGovTalk.ts).
    companiesHouseGatewayUrl: 'https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway',
    // TaxInANutshell's own CH Software Filing credentials (identify this
    // software to the gateway, not the filer) — never sent to the browser.
    // Read only by submit-accounts.post.ts / poll-accounts.post.ts.
    companiesHousePresenterId: '',
    companiesHousePresenterAuthCode: '',
    companiesHousePackageReference: '',
    // Server-only switch for the XML Gateway's <GatewayTest> flag —
    // defaults 'true' so going live requires a deliberate env var change,
    // not a filer picking "Live" by mistake.
    companiesHouseGatewayTest: true,
    // Companies House's separate, free, read-only Public Data API — used
    // only to prefill company details (requirements.md §3.1), distinct
    // from the XML Gateway above. See search.get.ts / company/[number].get.ts.
    companiesHouseApiKey: '',

    // Where the one server-side table (server/utils/db.ts) lives: a local
    // SQLite file in dev, but Vercel's serverless functions have no
    // persistent filesystem, so production needs NUXT_TURSO_DATABASE_URL/
    // _AUTH_TOKEN (remote libSQL/Turso) — db.ts refuses to fall back to a
    // local file on Vercel. dbPath is unused whenever tursoDatabaseUrl is set.
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
      // No pages/ router (single-screen wizard, app/app.vue), so the full
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

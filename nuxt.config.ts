// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Nothing here is ever stored server-side, and nothing typed into the
  // return — company figures, gateway credentials — should ever pass
  // through a server render. The whole app runs client-side only.
  ssr: false,

  css: ['~/assets/css/broadsheet.css'],

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

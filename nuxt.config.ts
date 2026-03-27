// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },

  modules: [
    '@nuxtjs/seo',
    '@pinia/nuxt',
  ],

  site: {
    url: 'https://terkaconifers.ru',
    name: 'Территория Хвойных',
    description: 'Каталог хвойных растений. 2300+ сортов с фото из частных садов по всей России.',
    defaultLocale: 'ru',
  },

  css: ['~/assets/css/main.css'],

  components: [
    { path: '~/components/layout', pathPrefix: false },
    { path: '~/components/home', pathPrefix: false },
    { path: '~/components/catalog', pathPrefix: false },
    { path: '~/components/plant', pathPrefix: false },
    { path: '~/components/cart', pathPrefix: false },
    { path: '~/components/admin', pathPrefix: false },
    { path: '~/components/ui', pathPrefix: false },
  ],

  runtimeConfig: {
    public: {
      siteUrl: process.env.SITE_URL || 'https://terkaconifers.ru',
    },
  },

  app: {
    baseURL: '/',
    head: {
      htmlAttrs: { lang: 'ru' },
      title: 'Территория Хвойных — каталог хвойных растений',
      meta: [
        { name: 'theme-color', content: '#1a5632' },
        { name: 'google-site-verification', content: 'IzaiVDAzqrc1UMN0nniuGOwe-IkBPsxtebgzZoOjNpg' },
        { name: 'yandex-verification', content: 'fe5e01bfe9458a43' },
      ],
      script: [
        {
          type: 'text/javascript',
          innerHTML: `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=108241620','ym');ym(108241620,'init',{ssr:true,clickmap:true,ecommerce:"dataLayer",trackLinks:true,accurateTrackBounce:true});`,
        },
      ],
      noscript: [
        { innerHTML: '<div><img src="https://mc.yandex.ru/watch/108241620" style="position:absolute;left:-9999px;" alt=""/></div>' },
      ],
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap', media: 'print', onload: 'this.media="all"' },
      ],
    },
  },

  routeRules: {
    '/': { isr: 600 },
    '/catalog/**': { isr: 600 },
    '/plant/**': { isr: 3600 },
    '/articles/**': { isr: 3600 },
  },

  sitemap: {
    sources: ['/api/__sitemap__/urls'],
  },
})

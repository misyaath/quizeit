import { defineConfig } from 'vitepress'

const repository = 'https://github.com/misyaath/quizeit'

export default defineConfig({
  title: 'Quizeit Docs',
  description: 'Developer guides for building, running, and extending Quizeit.',
  base: '/quizeit/',
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'Get started', link: '/getting-started' },
      { text: 'Plugins', link: '/plugins' },
    ],
    sidebar: [
      {
        text: 'Develop Quizeit',
        items: [
          { text: 'Local setup', link: '/getting-started' },
          { text: 'Architecture', link: '/development' },
        ],
      },
      {
        text: 'Build plugins',
        items: [
          { text: 'Plugin guide and SDK', link: '/plugins' },
          { text: 'CSV results export tutorial', link: '/csv-plugin-tutorial' },
        ],
      },
      {
        text: 'Use Quizeit',
        items: [
          { text: 'Using the app', link: '/using-the-app' },
          { text: 'Author question sets', link: '/question-authoring' },
        ],
      },
    ],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: repository + '/edit/main/docs/:path' },
  },
})

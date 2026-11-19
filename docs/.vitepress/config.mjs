import { defineConfig } from 'vitepress'

const repository = 'https://github.com/misyaath/quizeit'

export default defineConfig({
  title: 'Quizeit Docs',
  description: 'User and developer guides for running, using, and extending Quizeit.',
  base: '/quizeit/',
  lastUpdated: true,
  themeConfig: {
    nav: [
      { text: 'User Guide', link: '/docs/', activeMatch: '^/docs/' },
      { text: 'Developer Docs', link: '/', activeMatch: '^/(?!docs/)' },
    ],
    sidebar: {
      '/docs/': [
        {
          text: 'User Guide',
          items: [
            { text: 'Set up Quizeit', link: '/docs/setup' },
            { text: 'Create your first exam', link: '/docs/first-exam' },
            { text: 'Take an invited exam', link: '/docs/take-exam' },
            { text: 'Practice and review results', link: '/docs/practice' },
            { text: 'Feature reference', link: '/using-the-app' },
          ],
        },
      ],
      '/': [
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
          text: 'Reference',
          items: [
            { text: 'Using the app', link: '/using-the-app' },
            { text: 'Author question sets', link: '/question-authoring' },
          ],
        },
      ],
    },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: repository + '/edit/main/docs/:path' },
  },
})

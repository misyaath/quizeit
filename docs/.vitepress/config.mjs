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
          text: 'App sidebar',
          items: [
            { text: 'Dashboard', link: '/docs/dashboard' },
            { text: 'Practice exams', link: '/docs/practice' },
            { text: 'Question bank', link: '/docs/question-bank' },
            { text: 'Attempt history', link: '/docs/attempt-history' },
            { text: 'Manage question sets', link: '/docs/question-sets' },
            { text: 'Exam question bank', link: '/docs/exam-question-bank' },
            { text: 'Real exams', link: '/docs/first-exam' },
            { text: 'Candidate invitations', link: '/docs/invitations' },
            { text: 'Generate questions', link: '/docs/generate-questions' },
            { text: 'Users', link: '/docs/setup' },
            { text: 'Settings', link: '/docs/settings' },
            { text: 'Export practice results', link: '/docs/export-practice-results' },
          ],
        },
        {
          text: 'Related tasks',
          items: [
            { text: 'Add and edit questions', link: '/docs/questions' },
            { text: 'Take an invited exam', link: '/docs/take-exam' },
            { text: 'Review exam submissions', link: '/docs/results' },
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

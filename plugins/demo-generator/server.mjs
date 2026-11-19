import { definePlugin } from '../../packages/plugin-sdk/index.js'

export default definePlugin(plugin => {
  plugin.contribute('quizeit.question-generators', 'sample', {
    name: 'Demo generator · Sample questions',
    formats: ['single'],
    async generate({ batch, signal }) {
      signal.throwIfAborted()
      const questions = batch.types.map((type, index) => {
        const number = batch.offset + index + 1
        return {
          type,
          prompt: 'A sample set contains ' + number + ' questions. One more is added. How many does it contain?',
          options: [number, number + 1, number + 2].map(String),
          answer: String(number + 1),
          explanation: 'Add one to the original count.',
        }
      })
      return {
        model: 'Demo generator',
        text: JSON.stringify({
          providerName: 'Development fixtures',
          examName: 'Plugin example',
          title: 'Demo generator sample',
          questions,
        }),
      }
    },
  })
})

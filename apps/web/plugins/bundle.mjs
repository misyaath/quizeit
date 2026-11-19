import { resolve } from 'node:path'
import { pluginManifests } from '../../server/plugins/config.mjs'

export function pluginPageBundle() {
  return {
    name: 'quizeit-plugin-pages',
    setup(build) {
      build.onResolve({ filter: /^quizeit:plugin-pages$/ }, () => ({ path: 'pages', namespace: 'quizeit-plugins' }))
      build.onLoad({ filter: /.*/, namespace: 'quizeit-plugins' }, async () => {
        const manifests = (await pluginManifests()).filter(manifest => manifest.browser)
        const imports = manifests.map(({ directory }, index) =>
          'import { pages as plugin' + index + ' } from ' + JSON.stringify(resolve(directory, 'browser.jsx')))
        const entries = manifests.map(({ id }, index) => JSON.stringify(id) + ': plugin' + index)
        return { contents: [...imports, 'export default {' + entries.join(',') + '}'].join('\n'), resolveDir: resolve('.') }
      })
    },
  }
}

import { copyFile, mkdir } from 'node:fs/promises'
import { build, context } from 'esbuild'
import { readCatalog } from './question-files.mjs'
import { startServer } from './server.mjs'
import { pluginPageBundle } from '../apps/web/plugins/bundle.mjs'

await readCatalog()

const development = process.argv.includes('--dev')
const options = {
  entryPoints: {
    main: 'src/main.jsx',
    'code-editor': 'src/editor/monaco.mjs',
    'code-worker': 'monaco-editor/editor/editor.worker',
    'code-typescript-worker': 'monaco-editor/languages/features/typescript/ts.worker',
  },
  outdir: 'dist/assets',
  bundle: true,
  format: 'esm',
  minify: !development,
  sourcemap: development,
  external: ['/assets/code-editor.js'],
  loader: { '.ttf': 'dataurl' },
  plugins: [pluginPageBundle()],
  define: { 'process.env.NODE_ENV': JSON.stringify(development ? 'development' : 'production') },
}

await mkdir('dist', { recursive: true })
await copyFile('index.html', 'dist/index.html')

if (development) {
  const server = await context(options)
  await server.rebuild()
  await server.watch()
  await startServer()
} else {
  await build(options)
}

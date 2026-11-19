import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { All, Controller, Module } from '@nestjs/common'
import { readRoute } from '../../src/routes.js'
import { ApiError } from '../openai.mjs'
import { bindRoute } from './nest-http.mjs'

const bundleTypes = {
  js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8',
  map: 'application/json', ttf: 'font/ttf',
}
const bundlePath = /^\/assets\/[a-z0-9][.\w-]*\.(js|css|map|ttf)$/i

class FrontendController {
  async serve({ req, url }, res) {
    if (req.method !== 'GET') throw new ApiError(404, 'Page not found.')
    const bundle = bundlePath.exec(url.pathname)
    if (!bundle && readRoute(url).screen === 'not-found') throw new ApiError(404, 'Page not found.')
    const file = bundle ? url.pathname.slice(1) : 'index.html'
    const contentType = bundle ? bundleTypes[bundle[1].toLowerCase()] : 'text/html; charset=utf-8'
    const body = await readFile(resolve('dist', file)).catch(error => {
      if (error.code === 'ENOENT') throw new ApiError(404, 'Run npm run build before starting the server.')
      throw error
    })
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' })
    res.end(body)
  }
}

Controller()(FrontendController)
bindRoute(FrontendController, 'serve', All('{*path}'))

export class FrontendModule {}
Module({ controllers: [FrontendController] })(FrontendModule)

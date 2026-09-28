import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('reads a source image in a background tab, where Chrome never settles img.decode()', async () => {
  const server = await createServer({
    configFile: false,
    // Own dep cache so parallel browser tests do not invalidate each other's imports.
    cacheDir: 'node_modules/.vite-image-source-test',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'image-source-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/image-source-test') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end('<!doctype html><meta charset="utf-8"><body></body>')
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}image-source-test`)
    const result = await page.evaluate<{ hash: string; width: number; height: number } | string>(`(async () => {
      const { fingerprintSourceImage } = await import('/src/drafts/image.ts')
      const canvas = document.createElement('canvas')
      canvas.width = 3; canvas.height = 2
      const dataUrl = canvas.toDataURL('image/png')
      HTMLImageElement.prototype.decode = () => new Promise(() => {})
      const timeout = new Promise((resolve) => setTimeout(() => resolve('pending'), 3000))
      return Promise.race([fingerprintSourceImage({ filename: 'cover.png', mimeType: 'image/png', dataUrl }, document), timeout])
    })()`)
    expect(result).toMatchObject({ hash: expect.stringMatching(/^[a-f0-9]{64}$/), width: 3, height: 2 })
  } finally {
    await browser.close()
    await server.close()
  }
}, 30_000)

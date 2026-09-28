import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('merges the first photo into a short cover and declines when text plus photo overflow the frame', async () => {
  const server = await createServer({
    configFile: false,
    // Own dep cache: parallel browser tests re-optimizing a shared cache invalidate each other's imports.
    cacheDir: 'node_modules/.vite-cover-photo-test',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'cover-photo-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/cover-photo-test') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end('<!doctype html><meta charset="utf-8">')
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}cover-photo-test`)
    const result = await page.evaluate<{ short: string | null; long: string | null; tall: string | null }>(`(async () => {
      const { renderCardWithPhotoPng } = await import('/src/render/card.ts')
      const { DEFAULT_RENDER_OPTIONS } = await import('/src/types.ts')
      const photo = (width, height) => {
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d')
        const gradient = context.createLinearGradient(0, 0, width, height)
        gradient.addColorStop(0, '#1d9bf0'); gradient.addColorStop(1, '#f91880')
        context.fillStyle = gradient
        context.fillRect(0, 0, width, height)
        return canvas.toDataURL('image/png')
      }
      const options = { ...DEFAULT_RENDER_OPTIONS, background: { kind: 'solid', color: '#ddeeff' } }
      const post = (text) => ({ text, authorDisplayName: '作者', handle: 'example', postUrl: 'https://x.com/example/status/1', createdAt: '2026-09-28T02:00:00Z', stats: { views: 1200 } })
      const encode = (bytes) => {
        if (!bytes) return null
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
        return btoa(binary)
      }
      return {
        short: encode(await renderCardWithPhotoPng(post('短短一句话，配一张图。'), options, photo(1200, 800))),
        long: encode(await renderCardWithPhotoPng(post('很长的一段文字。'.repeat(80)), options, photo(1200, 800))),
        tall: encode(await renderCardWithPhotoPng(post('短短一句话。'), options, photo(800, 1600))),
      }
    })()`)
    expect(result.short).not.toBeNull()
    expect(result.long).toBeNull()
    expect(result.tall).toBeNull()
    mkdirSync('artifacts/playwright', { recursive: true })
    writeFileSync('artifacts/playwright/cover-with-photo.png', Buffer.from(result.short!, 'base64'))
  } finally {
    await browser.close()
    await server.close()
  }
}, 30_000)

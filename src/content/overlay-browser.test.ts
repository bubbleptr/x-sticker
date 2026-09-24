import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('keeps keyboard focus inside the overlay while Inspector preferences are loading', async () => {
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'overlay-focus-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/overlay-focus-test') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end('<!doctype html><button id="background-action">页面操作</button>')
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}overlay-focus-test`)
    await page.evaluate(`(async () => {
      Object.defineProperty(window, 'chrome', { configurable: true, value: {
        runtime: { sendMessage: async () => ({ ok: true, jobs: [] }) },
        storage: {
          local: { get: () => new Promise(() => {}), set: async () => {} },
          onChanged: { addListener() {}, removeListener() {} },
        },
      } })
      const moduleUrl = '/src/content/overlay.ts'
      const { openCardOverlay } = await import(moduleUrl)
      openCardOverlay({ ok: true, post: { text: '偏好正在读取', postUrl: 'https://x.com/example/status/1' } })
    })()`)
    expect(await page.locator('.inspector').evaluate((element) => element.hasAttribute('inert'))).toBe(true)

    const focused = () => page.evaluate(() => {
      const host = document.getElementById('katie-card-overlay')!
      return document.activeElement === host ? host.shadowRoot!.activeElement?.id : document.activeElement?.id
    })
    expect(await focused()).toBe('sheet')
    for (const expected of ['showProgress', 'close', 'showProgress', 'close']) {
      await page.keyboard.press('Tab')
      expect(await focused()).toBe(expected)
    }
    for (const expected of ['showProgress', 'close', 'showProgress', 'close']) {
      await page.keyboard.press('Shift+Tab')
      expect(await focused()).toBe(expected)
    }
    await page.locator('#sheet').focus()
    await page.keyboard.press('Shift+Tab')
    expect(await focused()).toBe('close')
  } finally {
    await browser.close()
    await server.close()
  }
}, 30_000)

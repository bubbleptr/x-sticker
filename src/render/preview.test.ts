import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('fits a complete export through viewport resizing without resampling its bitmap', async () => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'preview-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/preview-test') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end('<!doctype html><div id="viewport" style="width:420px;height:560px;overflow:auto;display:flex"><canvas style="flex:none;margin:auto"></canvas></div>')
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}preview-test`)
    await page.evaluate(`(async () => {
      const { createPreviewController } = await import('/src/render/preview.ts')
      const original = document.createElement('canvas')
      original.width = 1080; original.height = 1440
      const context = original.getContext('2d')
      context.fillStyle = '#123456'; context.fillRect(0, 0, 1080, 1440)
      context.fillStyle = '#ff0000'; context.fillRect(1079, 1439, 1, 1)
      const blob = await new Promise(resolve => original.toBlob(resolve, 'image/png'))
      window.previewController = createPreviewController(document.querySelector('canvas'), document.querySelector('#viewport'))
      window.previewController.paint(new Uint8Array(await blob.arrayBuffer()))
    })()`)
    await page.waitForFunction(() => document.querySelector('canvas')!.width === 1080)
    const fit = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!
      const bounds = canvas.getBoundingClientRect()
      return { width: bounds.width, height: bounds.height, bitmap: [canvas.width, canvas.height], corner: [...canvas.getContext('2d')!.getImageData(1079, 1439, 1, 1).data] }
    })
    expect(fit.bitmap).toEqual([1080, 1440])
    expect(fit.corner).toEqual([255, 0, 0, 255])
    expect(fit.width).toBeLessThanOrEqual(420)
    expect(fit.height).toBeLessThanOrEqual(560)
    expect(fit.width / fit.height).toBeCloseTo(3 / 4)
    await page.locator('#viewport').evaluate((viewport) => {
      viewport.style.width = '240px'
      viewport.style.height = '280px'
    })
    await page.waitForFunction(() => document.querySelector('canvas')!.getBoundingClientRect().height <= 280)
    const resized = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!
      const viewport = document.getElementById('viewport')!
      const bounds = canvas.getBoundingClientRect()
      return { width: bounds.width, height: bounds.height, scrollWidth: viewport.scrollWidth, scrollHeight: viewport.scrollHeight, bitmap: [canvas.width, canvas.height], corner: [...canvas.getContext('2d')!.getImageData(1079, 1439, 1, 1).data] }
    })
    expect(resized.width).toBeLessThanOrEqual(240)
    expect(resized.height).toBeLessThanOrEqual(280)
    expect(resized.width / resized.height).toBeCloseTo(3 / 4)
    expect(resized.scrollWidth).toBeLessThanOrEqual(240)
    expect(resized.scrollHeight).toBeLessThanOrEqual(280)
    expect(resized.bitmap).toEqual([1080, 1440])
    expect(resized.corner).toEqual([255, 0, 0, 255])
    await page.evaluate('window.previewController.destroy()')
  } finally {
    await browser.close()
    await server.close()
  }
}, 30_000)

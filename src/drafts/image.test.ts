import { existsSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page, type ElementHandle } from 'playwright-core'
import { fingerprintImage } from './image'

const executablePath = process.env.CHROME_BIN ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync)

async function fingerprint(page: Page, selector: string): Promise<string> {
  const image = await page.$(selector) as ElementHandle<HTMLImageElement> | null
  if (!image) throw new Error('Missing test image')
  return page.evaluate(fingerprintImage, image)
}

describe.skipIf(!executablePath)('image identity in Chrome', () => {
  let browser: Browser
  let page: Page
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath, headless: true })
    page = await browser.newPage()
    await page.route('http://localhost:31111/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }))
    await page.goto('http://localhost:31111/')
  })
  afterAll(async () => { await browser?.close() })

  it('recognizes identical pixels across new blob URLs, but detects a replaced image and changed dimensions', async () => {
    await page.evaluate(async () => {
      document.body.innerHTML = ''
      for (const [id, color, width] of [['first', 'red', 2], ['same', 'red', 2], ['other', 'blue', 2], ['resized', 'red', 3]] as const) {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = 2
        const context = canvas.getContext('2d')!
        context.fillStyle = color
        context.fillRect(0, 0, width, 2)
        const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)))
        const image = new Image()
        image.id = id
        image.src = URL.createObjectURL(blob)
        document.body.append(image)
        await image.decode()
      }
    })
    const first = await fingerprint(page, '#first')
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(await fingerprint(page, '#same')).toBe(first)
    expect(await fingerprint(page, '#other')).not.toBe(first)
    expect(await fingerprint(page, '#resized')).not.toBe(first)
  })

  it('does not manufacture an identity for a failed image', async () => {
    await page.evaluate(() => {
      const image = new Image()
      image.id = 'failed'
      document.body.append(image)
    })
    await expect(fingerprint(page, '#failed')).rejects.toThrow(/图片/)
  })

  it('stops if the platform does not permit reading loaded image pixels', async () => {
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 2
      return canvas.toDataURL().split(',')[1]
    })
    await page.route('http://127.0.0.1:31112/picture.png', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }))
    await page.evaluate(async () => {
      const image = new Image()
      image.id = 'cross-origin'
      image.src = 'http://127.0.0.1:31112/picture.png'
      document.body.append(image)
      await image.decode()
    })
    await expect(fingerprint(page, '#cross-origin')).rejects.toThrow(/读取|核对/)
  })
})

import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('preserves CSS bold text through scraping and browser PNG export without bolding normal text', async () => {
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'post-formatting-test', configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== '/post-formatting-test') return next()
        response.setHeader('Content-Type', 'text/html')
        response.end(`<!doctype html><style>.x-bold { font-weight: 700 } .x-normal { font-weight: 400 }</style>
          <article><div data-testid="tweetText">Keep this weight<br><span class="x-bold">Keep <span>this weight</span></span><br><span class="x-bold"><span class="x-normal">Keep this weight</span></span></div></article>`)
      })
    } }],
  })
  await server.listen()
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'].find((path) => path && existsSync(path))
  const browser = await chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${server.resolvedUrls!.local[0]}post-formatting-test`)
    const result = await page.evaluate<{
      text: string
      weights: number[][]
      formatted: { width: number; height: number; ink: number[] }
      plain: { width: number; height: number; ink: number[] }
    }>(`(async () => {
      const { scrapeArticle } = await import('/src/content/scrape.ts')
      const { renderCardPng, buildStatusArticleHtml } = await import('/src/render/card.ts')
      const { DEFAULT_RENDER_OPTIONS } = await import('/src/types.ts')
      const scraped = scrapeArticle(document.querySelector('article'), 'https://x.com/test/status/123')
      if (!scraped.ok) throw new Error('fixture was not scraped')
      const options = { ...DEFAULT_RENDER_OPTIONS, background: { kind: 'solid', color: '#ddeeff' } }
      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)
      const doc = iframe.contentDocument
      doc.open(); doc.write(buildStatusArticleHtml(scraped.post, options)); doc.close()
      await doc.fonts.ready
      const article = doc.querySelector('.article')
      const articleBounds = article.getBoundingClientRect()
      const lines = [...doc.querySelectorAll('.body .line')].map((line) => {
        const bounds = line.getBoundingClientRect()
        const weights = []
        const walker = doc.createTreeWalker(line, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) weights.push(Number(iframe.contentWindow.getComputedStyle(walker.currentNode.parentElement).fontWeight))
        return { top: bounds.top - articleBounds.top, height: bounds.height, weights }
      })
      const articleWidth = articleBounds.width
      iframe.remove()

      const measure = async (post) => {
        const png = await renderCardPng(post, options)
        const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }))
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width; canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        context.drawImage(bitmap, 0, 0)
        bitmap.close()
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
        const isWhite = (x, y) => {
          const offset = (y * canvas.width + x) * 4
          return data[offset] === 255 && data[offset + 1] === 255 && data[offset + 2] === 255
        }
        // Locate the white card in the colored frame independently of export placement.
        let top = 0
        while (top < canvas.height && !isWhite(Math.floor(canvas.width / 2), top)) top++
        let left = 0
        while (left < canvas.width && !isWhite(left, top)) left++
        let right = canvas.width - 1
        while (right > left && !isWhite(right, top)) right--
        const scale = (right - left + 1) / articleWidth
        const ink = lines.map((line) => {
          let count = 0
          for (let y = Math.ceil(top + line.top * scale); y < Math.floor(top + (line.top + line.height) * scale); y++) {
            for (let x = left; x <= right; x++) {
              const offset = (y * canvas.width + x) * 4
              if (data[offset] < 120 && data[offset + 1] < 120 && data[offset + 2] < 120) count++
            }
          }
          return count
        })
        return { width: canvas.width, height: canvas.height, ink }
      }
      const formatted = await measure(scraped.post)
      const plain = await measure({ ...scraped.post, textRuns: undefined })
      return { text: scraped.post.text, weights: lines.map((line) => line.weights), formatted, plain }
    })()`)
    expect(result.text).toBe('Keep this weight\nKeep this weight\nKeep this weight')
    expect(result.formatted).toMatchObject({ width: 1080, height: 1440 })
    expect(result.plain).toMatchObject({ width: 1080, height: 1440 })
    expect(result.formatted.ink[1]).toBeGreaterThan(result.plain.ink[1] * 1.1)
    expect(result.formatted.ink[0]).toBeGreaterThan(0)
    expect(result.formatted.ink[0]).toBe(result.plain.ink[0])
    expect(result.formatted.ink[2]).toBe(result.plain.ink[2])
    expect(result.weights[0]).toEqual([400])
    expect(result.weights[1].every((weight: number) => weight >= 600)).toBe(true)
    expect(result.weights[2]).toEqual([400])
  } finally {
    await browser.close()
    await server.close()
  }
}, 30_000)

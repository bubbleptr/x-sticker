import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import type { PostText, RenderOptions } from '../types'
import { ASPECT_SIZE } from '../types'
import { buildStatusArticleHtml } from './statusHtml'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/local/bin/google-chrome',
].filter(Boolean) as string[]

async function avatarToDataUrl(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined
  if (url.startsWith('data:')) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || 'image/jpeg'
    return `data:${ct};base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}

/**
 * Rasterize X status HTML via headless Chrome into a vertical export PNG
 * (full-bleed white content, white letterboxing — no floating card).
 */
export async function renderStatusPngViaChrome(
  post: PostText,
  options: RenderOptions,
): Promise<Uint8Array> {
  const { width: outW, height: outH } = ASPECT_SIZE[options.aspect]
  const articleCssWidth = 598
  const scale = outW / articleCssWidth

  const avatarDataUrl = await avatarToDataUrl(
    post.avatarUrl?.replace('_normal.', '_bigger.') ?? post.avatarUrl,
  )
  const html = buildStatusArticleHtml(post, options, {
    avatarDataUrl,
    articleWidth: articleCssWidth,
  })

  const dir = mkdtempSync(join(tmpdir(), 'katie-card-'))
  const htmlPath = join(dir, 'card.html')
  const shotPath = join(dir, 'article.png')
  writeFileSync(htmlPath, html, 'utf8')

  const executablePath = CHROME_CANDIDATES.find(Boolean)
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  })

  try {
    const page = await browser.newPage({
      viewport: { width: Math.ceil(articleCssWidth), height: 900 },
      deviceScaleFactor: scale,
    })
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' })
    // Wait for fonts / emoji
    await page.evaluate(async () => {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
      if (fonts?.ready) await fonts.ready
    })
    const article = page.locator('article.article')
    await article.screenshot({ path: shotPath, type: 'png' })
    await browser.close()

    // Composite onto white vertical canvas using sharp if available; else canvas
    const articlePng = readFileSync(shotPath)
    return await compositeOnWhite(articlePng, outW, outH)
  } catch (err) {
    await browser.close().catch(() => undefined)
    throw err
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function compositeOnWhite(
  articlePng: Buffer,
  outW: number,
  outH: number,
): Promise<Uint8Array> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const img = await loadImage(articlePng)
  const canvas = createCanvas(outW, outH)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, outW, outH)
  // Article screenshot already at deviceScaleFactor = outW/598, so width ≈ outW
  const drawW = outW
  const drawH = Math.round((img.height / img.width) * drawW)
  const y = Math.max(0, Math.round((outH - drawH) / 2))
  ctx.drawImage(img, 0, y, drawW, Math.min(drawH, outH))
  return new Uint8Array(canvas.toBuffer('image/png'))
}

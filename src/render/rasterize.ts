import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import type { BundledBackgroundFile } from '../photoBackgrounds'
import type { Background, PostText, RenderOptions } from '../types'
import { ASPECT_SIZE } from '../types'
import { bundledBackgroundFilePath } from './bundledBackgroundFile'
import { drawStatusCard, paintOuterBackground } from './outerFrame'
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
 * Rasterize X status HTML via headless Chrome into a vertical export PNG.
 * The article stays the white status card, centered on the outer background.
 */
export async function renderStatusPngViaChrome(
  post: PostText,
  options: RenderOptions,
): Promise<Uint8Array> {
  const { width: outW, height: outH } = ASPECT_SIZE[options.aspect]
  const articleCssWidth = 598
  // Integer DPR for crisp SVG rings; scale down to export width when compositing.
  const captureDpr = 2

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
      deviceScaleFactor: captureDpr,
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

    const articlePng = readFileSync(shotPath)
    return await compositeExport(articlePng, outW, outH, options.background)
  } catch (err) {
    await browser.close().catch(() => undefined)
    throw err
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function loadBundledBackground(src: BundledBackgroundFile) {
  const { loadImage } = await import('@napi-rs/canvas')
  return loadImage(bundledBackgroundFilePath(src))
}

async function compositeExport(
  articlePng: Buffer,
  outW: number,
  outH: number,
  background: Background,
): Promise<Uint8Array> {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  const img = await loadImage(articlePng)
  const canvas = createCanvas(outW, outH)
  const ctx = canvas.getContext('2d')
  await paintOuterBackground(ctx, background, outW, outH, loadBundledBackground)
  drawStatusCard(ctx, img, outW, outH)
  return new Uint8Array(canvas.toBuffer('image/png'))
}

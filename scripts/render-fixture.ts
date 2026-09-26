/**
 * Render v7 sticker + tight action-bar crop for icon QA.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { isPng } from '../src/render/card'
import { renderCardPng } from '../src/render/cardNode'
import { buildStatusArticleHtml } from '../src/render/statusHtml'
import type { PostText, RenderOptions } from '../src/types'
import { chromium } from 'playwright-core'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const outFull = process.argv[2] ?? resolve('/opt/cursor/artifacts/katie_x_web_v7.png')
const outIcons = process.argv[3] ?? resolve('/opt/cursor/artifacts/katie_x_web_v7_icons.png')
const outCrop = process.argv[4] ?? resolve('/opt/cursor/artifacts/katie_x_web_v7_crop.png')

const post: PostText = {
  text: '我一年内都会无条件看多 Grok！Grok 一定会崛起的！相信老马！\n\n原因无他，我订阅了一年 Heavy 🥲',
  authorDisplayName: 'Kieran Zhang',
  handle: 'ninthbit_ai',
  avatarUrl:
    'https://pbs.twimg.com/profile_images/2008017379247247360/CwS3-oAa_bigger.jpg',
  postUrl: 'https://x.com/ninthbit_ai/status/2102420702448234995',
  createdAt: '2026-09-22T15:32:11.000Z',
  verified: true,
  liked: false,
  bookmarked: false,
  stats: {
    replies: 52,
    reposts: 3,
    likes: 90,
    bookmarks: 4,
    views: 14671,
  },
}

const options: RenderOptions = {
  privacyMode: false,
  hideHandle: false,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#ffffff' },
  locale: 'zh-CN',
  showMenu: true,
}

const bytes = await renderCardPng(post, options)
if (!isPng(bytes) || bytes.byteLength < 1000) {
  console.error('render failed')
  process.exit(1)
}

mkdirSync(dirname(outFull), { recursive: true })
writeFileSync(outFull, bytes)

// Article crop (content only, no letterbox) via Chrome at DPR 2
const html = buildStatusArticleHtml(post, options, { articleWidth: 598 })
const dir = mkdtempSync(join(tmpdir(), 'katie-v7-'))
const htmlPath = join(dir, 'a.html')
writeFileSync(htmlPath, html)
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
})
const page = await browser.newPage({
  viewport: { width: 620, height: 500 },
  deviceScaleFactor: 2,
})
await page.goto(`file://${htmlPath}`)
await page.evaluate(async () => {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (fonts?.ready) await fonts.ready
})

const measures = await page.evaluate(() => {
  const svg = document.querySelector('.actions svg') as SVGElement
  const icon = document.querySelector('.action-icon') as HTMLElement
  const count = document.querySelector('.actions .count') as HTMLElement
  const cs = getComputedStyle(svg)
  const path = svg.querySelector('path')!
  return {
    svgWH: [cs.width, cs.height],
    svgFill: cs.fill,
    pathStroke: getComputedStyle(path).stroke,
    iconFontSize: getComputedStyle(icon).fontSize,
    countSize: getComputedStyle(count).fontSize,
    countWeight: getComputedStyle(count).fontWeight,
    dataIcon: svg.getAttribute('data-icon'),
    widthAttr: svg.getAttribute('width'),
  }
})
console.log('icon measures', JSON.stringify(measures))

const article = page.locator('article.article')
const articleBuf = await article.screenshot({ type: 'png' })
writeFileSync(outCrop, articleBuf)

const actions = page.locator('.actions')
const actionsBuf = await actions.screenshot({ type: 'png' })
writeFileSync(outIcons, actionsBuf)

// Side-by-side with reference if present
const refCandidates = [
  '/workspace/katie/xweb_action_bar.png',
  '/home/ubuntu/.cursor/projects/workspace/uploads/xweb_action_bar.png',
]
let refPath: string | undefined
for (const p of refCandidates) {
  try {
    readFileSync(p)
    refPath = p
    break
  } catch {
    /* missing */
  }
}

if (refPath) {
  const ref = await loadImage(refPath)
  const ours = await loadImage(actionsBuf)
  const gap = 16
  const labelH = 28
  const rowH = Math.max(ref.height, ours.height)
  const canvas = createCanvas(ref.width + ours.width + gap, rowH + labelH)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#536471'
  ctx.font = '14px sans-serif'
  ctx.fillText('X web (ref)', 0, 18)
  ctx.fillText('v7 (ours)', ref.width + gap, 18)
  ctx.drawImage(ref, 0, labelH)
  ctx.drawImage(ours, ref.width + gap, labelH)
  const compareOut = resolve('/opt/cursor/artifacts/katie_x_web_v7_icons_compare.png')
  writeFileSync(compareOut, canvas.toBuffer('image/png'))
  console.log(JSON.stringify({ compare: compareOut }))
}

await browser.close()
rmSync(dir, { recursive: true, force: true })

console.log(
  JSON.stringify({
    outFull,
    outIcons,
    outCrop,
    fullBytes: bytes.byteLength,
    measures,
  }),
)

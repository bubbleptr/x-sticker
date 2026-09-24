import type { PostText, RenderOptions } from '../types'
import { ASPECT_SIZE } from '../types'
import { isBundledBackgroundFile, type BundledBackgroundFile } from '../photoBackgrounds'
import { formatCompactCount, formatMetaClock } from './format'
import { drawStatusCard, paintOuterBackground } from './outerFrame'
import { buildStatusArticleHtml } from './statusHtml'

export { formatCompactCount, formatMetaClock } from './format'
export { buildStatusArticleHtml } from './statusHtml'

export type CreateCanvas = (width: number, height: number) => unknown
export type LoadImageFn = (url: string) => Promise<CanvasImageSource | null>

export const FONT_STACK =
  'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Noto Color Emoji", "WenQuanYi Micro Hei", "Noto Sans SC", sans-serif'

export const NO_LINE_START = '，。！？；、：）》」』…,.!?;:)]}'

const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/gu

/** Pure text decisions — layout helpers for tests / options. */
export function cardVisibleText(
  post: PostText,
  options: Pick<RenderOptions, 'hideHandle' | 'showAuthor'>,
): { body: string; displayName?: string; handleLine?: string } {
  const body = post.text.trim()
  const displayName =
    options.showAuthor && post.authorDisplayName?.trim()
      ? post.authorDisplayName.trim()
      : undefined
  const handleLine =
    !options.hideHandle && post.handle?.trim()
      ? `@${post.handle.trim().replace(/^@+/, '')}`
      : undefined
  return { body, displayName, handleLine }
}

/** Optional emoji strip for environments without color emoji (HTML path keeps emoji). */
export function sanitizeCardText(raw: string, stripEmoji = false): string {
  let s = raw.replace(/\u00a0/g, ' ')
  if (stripEmoji) s = s.replace(EMOJI_RE, '')
  return s.replace(/[ \t]{2,}/g, ' ').trim()
}

function isLatinWordChar(ch: string): boolean {
  return /[A-Za-z0-9]/.test(ch) || ch === "'" || ch === '’' || ch === '_' || ch === '-'
}

export function tokenizeForWrap(text: string): string[] {
  const tokens: string[] = []
  let i = 0
  const chars = [...text]
  while (i < chars.length) {
    const ch = chars[i]!
    if (ch === '\n') {
      tokens.push('\n')
      i += 1
      continue
    }
    if (/\s/.test(ch)) {
      let sp = ch
      i += 1
      while (i < chars.length && /\s/.test(chars[i]!) && chars[i] !== '\n') {
        sp += chars[i]
        i += 1
      }
      tokens.push(sp)
      continue
    }
    if (isLatinWordChar(ch)) {
      let word = ch
      i += 1
      while (i < chars.length && isLatinWordChar(chars[i]!)) {
        word += chars[i]
        i += 1
      }
      while (i < chars.length && /[.,!?;:]/.test(chars[i]!)) {
        word += chars[i]
        i += 1
      }
      tokens.push(word)
      continue
    }
    tokens.push(ch)
    i += 1
  }
  return tokens
}

export function avoidLineStartPunctuation(lines: string[]): string[] {
  const out = lines.map((l) => l)
  for (let i = 1; i < out.length; i++) {
    while (out[i] && NO_LINE_START.includes([...out[i]!][0]!)) {
      const chars = [...out[i]!]
      const head = chars.shift()!
      out[i - 1] = `${out[i - 1] ?? ''}${head}`
      out[i] = chars.join('')
    }
  }
  return out.map((l) => l.trimEnd()).filter((l, idx) => l.length > 0 || idx === 0)
}

export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.split(/\n/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('')
      continue
    }
    const tokens = tokenizeForWrap(paragraph)
    let current = ''
    const flush = () => {
      if (current) {
        lines.push(current)
        current = ''
      }
    }
    for (const token of tokens) {
      if (token === '\n') {
        flush()
        continue
      }
      if (/^\s+$/.test(token)) {
        if (!current) continue
        const withSpace = current + ' '
        if (ctx.measureText(withSpace).width <= maxWidth) current = withSpace
        else flush()
        continue
      }
      if (
        current &&
        token.length === 1 &&
        NO_LINE_START.includes(token) &&
        ctx.measureText(current + token).width <= maxWidth * 1.02
      ) {
        current += token
        continue
      }
      const candidate = current ? current + token : token
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate
        continue
      }
      if (current) flush()
      if (ctx.measureText(token).width <= maxWidth) {
        current = token
        continue
      }
      let chunk = ''
      for (const ch of token) {
        const next = chunk + ch
        if (chunk && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk)
          chunk = ch
        } else chunk = next
      }
      current = chunk
    }
    flush()
  }
  return avoidLineStartPunctuation(lines.length > 0 ? lines : [''])
}

export function sizeForAspect(aspect: RenderOptions['aspect']): { width: number; height: number } {
  return ASPECT_SIZE[aspect]
}

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}

function isBrowser(): boolean {
  return typeof document !== 'undefined'
}

async function loadBundledBackground(src: BundledBackgroundFile): Promise<ImageBitmap> {
  if (!isBundledBackgroundFile(src)) throw new Error(`unknown background: ${src}`)
  const url = chrome.runtime.getURL(src)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`background fetch failed: ${src}`)
  return createImageBitmap(await res.blob())
}

/**
 * Browser (in-page preview): html-to-image of X status HTML.
 * Node tests/scripts: import `renderCardPng` from `./cardNode` instead.
 */
export async function renderCardPng(
  post: PostText,
  options: RenderOptions,
  _createCanvas?: CreateCanvas,
  _loadImage?: LoadImageFn,
): Promise<Uint8Array> {
  void _createCanvas
  void _loadImage
  if (!isBrowser()) {
    throw new Error('Node: import renderCardPng from "./cardNode" (Chrome rasterize)')
  }
  return renderStatusPngViaDom(post, options)
}

async function renderStatusPngViaDom(
  post: PostText,
  options: RenderOptions,
): Promise<Uint8Array> {
  const { toPng } = await import('html-to-image')
  const { width: outW, height: outH } = ASPECT_SIZE[options.aspect]
  const articleCssWidth = 598
  const scale = outW / articleCssWidth

  const html = buildStatusArticleHtml(post, options, { articleWidth: articleCssWidth })
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${articleCssWidth}px;background:#fff;`
  document.body.appendChild(host)
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `width:${articleCssWidth}px;height:900px;border:0;`
  host.appendChild(iframe)
  const doc = iframe.contentDocument
  if (!doc) {
    host.remove()
    throw new Error('iframe unavailable')
  }
  doc.open()
  doc.write(html)
  doc.close()
  await new Promise((r) => setTimeout(r, 80))
  const article = doc.querySelector('article.article') as HTMLElement | null
  if (!article) {
    host.remove()
    throw new Error('article missing')
  }

  const dataUrl = await toPng(article, {
    pixelRatio: scale,
    backgroundColor: '#ffffff',
    width: articleCssWidth,
    height: article.scrollHeight,
  })
  host.remove()

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('png decode failed'))
    el.src = dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d unavailable')
  await paintOuterBackground<ImageBitmap>(
    ctx,
    options.background,
    outW,
    outH,
    loadBundledBackground,
  )
  drawStatusCard<HTMLImageElement>(ctx, img, outW, outH)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}

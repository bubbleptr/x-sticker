import {
  ASPECT_SIZE,
  type AspectRatio,
  type Background,
  type PostText,
  type RenderOptions,
} from '../types'

export type CardCanvas = {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
  convertToBlob?(options?: { type?: string }): Promise<Blob>
  toBuffer?(mime?: string): Buffer
}

export type CreateCanvas = (width: number, height: number) => CardCanvas

/** Prefer CJK-capable faces first; emoji is stripped (see sanitizeCardText). */
export const FONT_STACK =
  '"WenQuanYi Micro Hei", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans", "Segoe UI", sans-serif'

const PAD_RATIO = 0.11
const MIN_BODY_PX = 36
const MAX_BODY_PX = 64
const AUTHOR_PX = 30
const HANDLE_PX = 24
const QUOTE_PX = 72

/** Emoji / pictographs that commonly tofu on canvas without color-emoji shaping. */
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/gu
const VS_RE = /[\uFE0E\uFE0F]/g
const KEYCAP_RE = /[0-9#*]\uFE0F?\u20E3/g

/** Pure text decisions for the card — used by renderer and unit tests. */
export function cardVisibleText(
  post: PostText,
  options: Pick<RenderOptions, 'hideHandle' | 'showAuthor'>,
): { body: string; authorLine?: string; handleLine?: string } {
  const body = sanitizeCardText(post.text)
  const authorLine =
    options.showAuthor && post.authorDisplayName?.trim()
      ? sanitizeCardText(post.authorDisplayName)
      : undefined
  const handleLine =
    !options.hideHandle && post.handle?.trim()
      ? `@${post.handle.trim().replace(/^@+/, '')}`
      : undefined
  return { body, authorLine, handleLine }
}

/**
 * Remove emoji / variation selectors so canvas never paints tofu □.
 * Keeps CJK, Latin, digits, and common punctuation.
 */
export function sanitizeCardText(raw: string): string {
  return raw
    .replace(EMOJI_RE, '')
    .replace(KEYCAP_RE, '')
    .replace(VS_RE, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function isCjkChar(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0
  return (
    (cp >= 0x3040 && cp <= 0x30ff) || // Hiragana/Katakana
    (cp >= 0x3400 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility
    (cp >= 0xff00 && cp <= 0xffef) || // Half/fullwidth forms
    (cp >= 0x3000 && cp <= 0x303f) // CJK punctuation
  )
}

function isLatinWordChar(ch: string): boolean {
  // Keep hyphenated compounds (tweet-sticker) and apostrophes intact.
  return /[A-Za-z0-9]/.test(ch) || ch === "'" || ch === '’' || ch === '_' || ch === '-'
}

/** Tokenize for wrapping: Latin words stay intact; CJK breaks between chars. */
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
      // Keep trailing ASCII punctuation with the word when possible (.,!?:;)
      while (i < chars.length && /[.,!?;:]/.test(chars[i]!)) {
        word += chars[i]
        i += 1
      }
      tokens.push(word)
      continue
    }
    // CJK or other: one grapheme / code point
    tokens.push(ch)
    i += 1
  }
  return tokens
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
        if (ctx.measureText(withSpace).width <= maxWidth) {
          current = withSpace
        } else {
          flush()
        }
        continue
      }

      const candidate = current ? current + token : token
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate
        continue
      }

      // Don't start a line with space; break before this token when possible.
      if (current) flush()

      if (ctx.measureText(token).width <= maxWidth) {
        current = token
        continue
      }

      // Last resort: overlong single Latin token — break at maxWidth (rare).
      let chunk = ''
      for (const ch of token) {
        const next = chunk + ch
        if (chunk && ctx.measureText(next).width > maxWidth) {
          lines.push(chunk)
          chunk = ch
        } else {
          chunk = next
        }
      }
      current = chunk
    }
    flush()
  }

  return lines.length > 0 ? lines : ['']
}

function fillBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: Background,
): void {
  if (background.kind === 'solid') {
    ctx.fillStyle = background.color
    ctx.fillRect(0, 0, width, height)
    return
  }
  const grad = ctx.createLinearGradient(0, 0, 0, height)
  grad.addColorStop(0, background.from)
  grad.addColorStop(1, background.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
}

function isDarkBackground(background: Background): boolean {
  const sample = background.kind === 'solid' ? background.color : background.from
  const hex = sample.replace('#', '')
  if (hex.length !== 6) return false
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.45
}

function fitBody(
  ctx: CanvasRenderingContext2D,
  body: string,
  maxWidth: number,
  maxHeight: number,
): { fontSize: number; lines: string[]; lineHeight: number } {
  for (let fontSize = MAX_BODY_PX; fontSize >= MIN_BODY_PX; fontSize -= 2) {
    const lineHeight = Math.round(fontSize * 1.55)
    ctx.font = `500 ${fontSize}px ${FONT_STACK}`
    const lines = wrapLines(ctx, body, maxWidth)
    const total = lines.length * lineHeight
    if (total <= maxHeight) {
      return { fontSize, lines, lineHeight }
    }
  }
  const fontSize = MIN_BODY_PX
  const lineHeight = Math.round(fontSize * 1.55)
  ctx.font = `500 ${fontSize}px ${FONT_STACK}`
  let lines = wrapLines(ctx, body, maxWidth)
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    const last = lines[maxLines - 1] ?? ''
    lines[maxLines - 1] = `${last.replace(/\s+\S*$/, '').replace(/.$/, '')}…`
  }
  return { fontSize, lines, lineHeight }
}

async function canvasToPngBytes(canvas: CardCanvas): Promise<Uint8Array> {
  if (typeof canvas.convertToBlob === 'function') {
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const buf = await blob.arrayBuffer()
    return new Uint8Array(buf)
  }
  if (typeof canvas.toBuffer === 'function') {
    const buf = canvas.toBuffer('image/png')
    return new Uint8Array(buf)
  }
  throw new Error('Canvas cannot export PNG')
}

export function defaultCreateCanvas(width: number, height: number): CardCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height) as unknown as CardCanvas
  }
  if (typeof document !== 'undefined') {
    const el = document.createElement('canvas')
    el.width = width
    el.height = height
    return el as unknown as CardCanvas
  }
  throw new Error('No canvas implementation available')
}

export function sizeForAspect(aspect: AspectRatio): { width: number; height: number } {
  return ASPECT_SIZE[aspect]
}

/**
 * Pure renderer: (PostText, RenderOptions) => PNG bytes.
 * No Chrome APIs. Optional createCanvas for Node tests.
 */
export async function renderCardPng(
  post: PostText,
  options: RenderOptions,
  createCanvas: CreateCanvas = defaultCreateCanvas,
): Promise<Uint8Array> {
  const { width, height } = sizeForAspect(options.aspect)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  // Crisp text on retina-ish exports
  ctx.textBaseline = 'alphabetic'
  ctx.imageSmoothingEnabled = true

  fillBackground(ctx, width, height, options.background)
  const dark = isDarkBackground(options.background)
  const ink = dark ? '#f5f5f4' : '#1c1917'
  const muted = dark ? '#a8a29e' : '#78716c'
  const quoteColor = dark ? 'rgba(245,245,244,0.18)' : 'rgba(28,25,23,0.10)'

  const pad = Math.round(width * PAD_RATIO)
  const contentWidth = width - pad * 2
  const { body, authorLine, handleLine } = cardVisibleText(post, options)

  const hasFooter = Boolean(authorLine || handleLine)
  const footerBlock = hasFooter ? AUTHOR_PX + (handleLine ? HANDLE_PX + 14 : 0) + 28 : 0
  const footerReserve = footerBlock + pad
  const quoteReserve = Math.round(QUOTE_PX * 0.55)
  const bodyTopMin = pad + quoteReserve
  const bodyMaxHeight = height - bodyTopMin - footerReserve

  const fitted = fitBody(ctx, body, contentWidth, bodyMaxHeight)
  const bodyBlockHeight = fitted.lines.length * fitted.lineHeight

  // Vertically balance body between quote area and footer (not stuck at top with empty bottom).
  const available = height - pad - footerReserve - quoteReserve
  const bodyOffset = Math.max(0, Math.round((available - bodyBlockHeight) * 0.35))
  const bodyTop = bodyTopMin + bodyOffset

  // Subtle opening quote — sits above body, low contrast
  ctx.fillStyle = quoteColor
  ctx.font = `300 ${QUOTE_PX}px Georgia, "Noto Serif", "Times New Roman", serif`
  ctx.fillText('“', pad - 4, pad + Math.round(QUOTE_PX * 0.78))

  ctx.fillStyle = ink
  ctx.font = `500 ${fitted.fontSize}px ${FONT_STACK}`
  let y = bodyTop + fitted.fontSize
  for (const line of fitted.lines) {
    ctx.fillText(line, pad, y)
    y += fitted.lineHeight
  }

  // Author / handle anchored near bottom with breathing room
  let footerY = height - pad
  if (handleLine) {
    ctx.fillStyle = muted
    ctx.font = `400 ${HANDLE_PX}px ${FONT_STACK}`
    ctx.fillText(handleLine, pad, footerY)
    footerY -= HANDLE_PX + 14
  }
  if (authorLine) {
    ctx.fillStyle = muted
    ctx.font = `500 ${AUTHOR_PX}px ${FONT_STACK}`
    ctx.fillText(`— ${authorLine}`, pad, footerY)
  }

  return canvasToPngBytes(canvas)
}

/** PNG signature: 89 50 4E 47 0D 0A 1A 0A */
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

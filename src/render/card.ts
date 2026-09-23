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
export type LoadImageFn = (url: string) => Promise<CanvasImageSource | null>

/** Prefer CJK-capable faces first; emoji is stripped (see sanitizeCardText). */
export const FONT_STACK =
  '"WenQuanYi Micro Hei", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans", "Segoe UI", sans-serif'

const OUTER_PAD_RATIO = 0.1
const MIN_BODY_PX = 32
const MAX_BODY_PX = 48
const CARD_RADIUS = 28
const AVATAR_SIZE = 64
const X_LOGO_SIZE = 28

/** Characters that should not start a line (CJK + common punct). */
export const NO_LINE_START = '，。！？；、：）》」』…,.!?;:)]}'

/** Emoji / pictographs that commonly tofu on canvas without color-emoji shaping. */
const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/gu
const VS_RE = /[\uFE0E\uFE0F]/g
const KEYCAP_RE = /[0-9#*]\uFE0F?\u20E3/g

/** Pure text decisions for the card — used by renderer and unit tests. */
export function cardVisibleText(
  post: PostText,
  options: Pick<RenderOptions, 'hideHandle' | 'showAuthor'>,
): { body: string; displayName?: string; handleLine?: string } {
  const body = sanitizeCardText(post.text)
  const displayName =
    options.showAuthor && post.authorDisplayName?.trim()
      ? sanitizeCardText(post.authorDisplayName)
      : undefined
  const handleLine =
    !options.hideHandle && post.handle?.trim()
      ? `@${post.handle.trim().replace(/^@+/, '')}`
      : undefined
  return { body, displayName, handleLine }
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

function isLatinWordChar(ch: string): boolean {
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

/** Move leading punctuation onto the previous line. */
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
        if (ctx.measureText(withSpace).width <= maxWidth) {
          current = withSpace
        } else {
          flush()
        }
        continue
      }

      // Prefer keeping CJK punctuation with previous char (no line-start ，。)
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
        } else {
          chunk = next
        }
      }
      current = chunk
    }
    flush()
  }

  return avoidLineStartPunctuation(lines.length > 0 ? lines : [''])
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
  const grad = ctx.createLinearGradient(0, 0, width * 0.2, height)
  grad.addColorStop(0, background.from)
  grad.addColorStop(1, background.to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function fitBody(
  ctx: CanvasRenderingContext2D,
  body: string,
  maxWidth: number,
  maxHeight: number,
): { fontSize: number; lines: string[]; lineHeight: number } {
  for (let fontSize = MAX_BODY_PX; fontSize >= MIN_BODY_PX; fontSize -= 2) {
    const lineHeight = Math.round(fontSize * 1.45)
    ctx.font = `400 ${fontSize}px ${FONT_STACK}`
    const lines = wrapLines(ctx, body, maxWidth)
    const total = lines.length * lineHeight
    if (total <= maxHeight) {
      return { fontSize, lines, lineHeight }
    }
  }
  const fontSize = MIN_BODY_PX
  const lineHeight = Math.round(fontSize * 1.45)
  ctx.font = `400 ${fontSize}px ${FONT_STACK}`
  let lines = wrapLines(ctx, body, maxWidth)
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight))
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines)
    const last = lines[maxLines - 1] ?? ''
    lines[maxLines - 1] = `${last.replace(/\s+\S*$/, '').replace(/.$/, '')}…`
  }
  return { fontSize, lines, lineHeight }
}

function initialsFrom(post: PostText, displayName?: string): string {
  const raw = (displayName || post.authorDisplayName || post.handle || '用').trim()
  const chars = [...raw.replace(/^@/, '')]
  return (chars[0] ?? '用').toUpperCase()
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  image: CanvasImageSource | null,
  initials: string,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  if (image) {
    ctx.drawImage(image, x, y, size, size)
  } else {
    ctx.fillStyle = '#cfd9de'
    ctx.fillRect(x, y, size, size)
    ctx.fillStyle = '#0f1419'
    ctx.font = `600 ${Math.round(size * 0.42)}px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, x + size / 2, y + size / 2 + 1)
  }
  ctx.restore()
}

/** Official-style X mark (not the bird). */
export function drawXLogo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color = '#0f1419',
): void {
  const s = size * 0.42
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(3, size * 0.16)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - s, cy - s)
  ctx.lineTo(cx + s, cy + s)
  ctx.moveTo(cx + s, cy - s)
  ctx.lineTo(cx - s, cy + s)
  ctx.stroke()
  ctx.restore()
}

export async function loadAvatarImage(
  url: string | undefined,
  loader?: LoadImageFn,
): Promise<CanvasImageSource | null> {
  if (!url) return null
  if (loader) {
    try {
      return await loader(url)
    } catch {
      return null
    }
  }
  if (typeof Image !== 'undefined') {
    return await new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
  }
  return null
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
 * Pure renderer: X-style post card on an outer background.
 * No Chrome APIs. Optional createCanvas / loadImage for Node tests.
 */
export async function renderCardPng(
  post: PostText,
  options: RenderOptions,
  createCanvas: CreateCanvas = defaultCreateCanvas,
  loadImage?: LoadImageFn,
): Promise<Uint8Array> {
  const { width, height } = sizeForAspect(options.aspect)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  ctx.textBaseline = 'alphabetic'
  ctx.imageSmoothingEnabled = true

  // 1) Outer canvas background
  fillBackground(ctx, width, height, options.background)

  const outerPad = Math.round(width * OUTER_PAD_RATIO)
  const cardW = width - outerPad * 2
  const cardPad = Math.round(cardW * 0.055)
  const { body, displayName, handleLine } = cardVisibleText(post, options)

  const headerH = AVATAR_SIZE
  const nameGap = 16
  const textMaxW = cardW - cardPad * 2
  // Body area budget: leave room for header + paddings inside max outer card
  const maxCardH = height - outerPad * 2
  const bodyBudget = maxCardH - cardPad * 2 - headerH - nameGap - 8
  const fitted = fitBody(ctx, body, textMaxW, Math.max(bodyBudget, MIN_BODY_PX * 2))
  const bodyBlockH = fitted.lines.length * fitted.lineHeight
  const cardH = Math.min(
    maxCardH,
    cardPad * 2 + headerH + nameGap + bodyBlockH + 8,
  )
  const cardX = outerPad
  const cardY = Math.round((height - cardH) / 2)

  // Soft shadow
  ctx.save()
  ctx.shadowColor = 'rgba(15, 20, 25, 0.22)'
  ctx.shadowBlur = 36
  ctx.shadowOffsetY = 12
  roundRectPath(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  // White card fill (again without shadow bleed)
  roundRectPath(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  const avatar = await loadAvatarImage(post.avatarUrl, loadImage)
  const ax = cardX + cardPad
  const ay = cardY + cardPad
  drawAvatar(ctx, ax, ay, AVATAR_SIZE, avatar, initialsFrom(post, displayName))

  // X logo top-right
  drawXLogo(
    ctx,
    cardX + cardW - cardPad - X_LOGO_SIZE / 2,
    ay + AVATAR_SIZE / 2,
    X_LOGO_SIZE,
  )

  // Name + handle
  const textLeft = ax + AVATAR_SIZE + 18
  const textRightLimit = cardX + cardW - cardPad - X_LOGO_SIZE - 20
  const nameMaxW = Math.max(40, textRightLimit - textLeft)
  const nameY = ay + (handleLine && displayName ? 26 : AVATAR_SIZE / 2 + 8)

  if (displayName) {
    ctx.fillStyle = '#0f1419'
    ctx.font = `700 28px ${FONT_STACK}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    let name = displayName
    while (name.length > 1 && ctx.measureText(name).width > nameMaxW) {
      name = `${name.slice(0, -2)}…`
    }
    ctx.fillText(name, textLeft, nameY)
  }

  if (handleLine) {
    ctx.fillStyle = '#536471'
    ctx.font = `400 24px ${FONT_STACK}`
    const hy = displayName ? nameY + 30 : ay + AVATAR_SIZE / 2 + 8
    let handle = handleLine
    while (handle.length > 1 && ctx.measureText(handle).width > nameMaxW) {
      handle = `${handle.slice(0, -2)}…`
    }
    ctx.fillText(handle, textLeft, hy)
  }

  // If no name and no handle but showAuthor was false / missing — still show handle-like placeholder under avatar row only when both empty
  if (!displayName && !handleLine) {
    ctx.fillStyle = '#0f1419'
    ctx.font = `700 28px ${FONT_STACK}`
    ctx.fillText('用户', textLeft, ay + AVATAR_SIZE / 2 + 8)
  }

  // Body
  const bodyTop = ay + headerH + nameGap
  ctx.fillStyle = '#0f1419'
  ctx.font = `400 ${fitted.fontSize}px ${FONT_STACK}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  let y = bodyTop + fitted.fontSize
  for (const line of fitted.lines) {
    ctx.fillText(line, cardX + cardPad, y)
    y += fitted.lineHeight
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

import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it, beforeAll } from 'vitest'
import {
  cardVisibleText,
  isPng,
  renderCardPng,
  sanitizeCardText,
  tokenizeForWrap,
  wrapLines,
  type CreateCanvas,
} from './card'
import { ensureNodeCardFonts } from './nodeFonts'
import type { PostText, RenderOptions } from '../types'

const fixture: PostText = {
  text: '很多人以为效率是把日程填满，其实是把注意力留给真正重要的事。少即是多，对创作尤其如此。',
  authorDisplayName: '林间笔记',
  handle: 'katie_demo',
  postUrl: 'https://x.com/katie_demo/status/1234567890',
  createdAt: '2026-09-23T12:00:00.000Z',
}

const baseOptions: RenderOptions = {
  hideHandle: true,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#f7f4ef' },
}

const nodeCreateCanvas: CreateCanvas = (width, height) => {
  const canvas = createCanvas(width, height)
  return canvas as unknown as ReturnType<CreateCanvas>
}

beforeAll(() => {
  ensureNodeCardFonts()
})

describe('sanitizeCardText', () => {
  it('strips emoji so canvas will not paint tofu', () => {
    expect(sanitizeCardText('今天心情不错😀👍继续写')).toBe('今天心情不错继续写')
  })
})

describe('tokenizeForWrap / wrapLines', () => {
  it('keeps Latin and hyphenated compounds as single tokens', () => {
    const tokens = tokenizeForWrap('Hello tweet-sticker 世界')
    expect(tokens).toContain('Hello')
    expect(tokens).toContain('tweet-sticker')
    expect(tokens).toContain('世')
    expect(tokens).toContain('界')
    expect(tokens.some((t) => t === 'tweet' || t === 'sticker')).toBe(false)
  })

  it('does not break mid-Latin-word when wrapping', () => {
    const canvas = createCanvas(400, 200)
    const ctx = canvas.getContext('2d')
    ctx.font = '32px "WenQuanYi Micro Hei"'
    const word = 'tweet-sticker'
    const lines = wrapLines(
      ctx as unknown as CanvasRenderingContext2D,
      `前缀 ${word} 后缀`,
      200,
    )
    const brokenMid = lines.some(
      (line) => line.includes('tweet-st') && !line.includes('tweet-sticker'),
    )
    expect(brokenMid).toBe(false)
    expect(lines.join('')).toContain('tweet-sticker')
  })

  it('allows breaks between CJK characters', () => {
    const tokens = tokenizeForWrap('竖版卡片')
    expect(tokens).toEqual(['竖', '版', '卡', '片'])
  })
})

describe('cardVisibleText', () => {
  it('omits @handle when hideHandle is true', () => {
    const visible = cardVisibleText(fixture, { hideHandle: true, showAuthor: true })
    expect(visible.handleLine).toBeUndefined()
    expect(visible.authorLine).toBe('林间笔记')
    expect(visible.body).toContain('效率')
  })

  it('includes @handle when hideHandle is false', () => {
    const visible = cardVisibleText(fixture, { hideHandle: false, showAuthor: true })
    expect(visible.handleLine).toBe('@katie_demo')
  })

  it('normalizes handle without double @@', () => {
    const visible = cardVisibleText(
      { ...fixture, handle: '@already' },
      { hideHandle: false, showAuthor: false },
    )
    expect(visible.handleLine).toBe('@already')
    expect(visible.authorLine).toBeUndefined()
  })
})

describe('renderCardPng', () => {
  it('returns non-empty PNG magic bytes', async () => {
    const bytes = await renderCardPng(fixture, baseOptions, nodeCreateCanvas)
    expect(bytes.byteLength).toBeGreaterThan(100)
    expect(isPng(bytes)).toBe(true)
  })

  it('still renders PNG when handle is shown', async () => {
    const bytes = await renderCardPng(
      fixture,
      {
        ...baseOptions,
        hideHandle: false,
        aspect: '9:16',
        background: { kind: 'gradient', from: '#1c1917', to: '#44403c' },
      },
      nodeCreateCanvas,
    )
    expect(isPng(bytes)).toBe(true)
  })
})

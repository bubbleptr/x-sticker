import { createCanvas } from '@napi-rs/canvas'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  avoidLineStartPunctuation,
  cardVisibleText,
  formatCompactCount,
  formatMetaClock,
  isPng,
  sanitizeCardText,
  tokenizeForWrap,
  wrapLines,
} from './card'
import { renderCardPng } from './cardNode'
import { bundledBackgroundFilePath } from './bundledBackgroundFile'
import { CARD_SIDE_INSET_RATIO } from './outerFrame'
import { ensureNodeCardFonts } from './nodeFonts'
import type { PostText, RenderOptions } from '../types'

const fixture: PostText = {
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

const baseOptions: RenderOptions = {
  privacyMode: false,
  hideHandle: false,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#ffffff' },
  locale: 'zh-CN',
  showMenu: true,
}

beforeAll(() => {
  ensureNodeCardFonts()
})

describe('sanitizeCardText', () => {
  it('can strip emoji when requested', () => {
    expect(sanitizeCardText('今天😀写', true)).toBe('今天写')
  })

  it('keeps emoji by default for HTML path', () => {
    expect(sanitizeCardText('Heavy 🥲')).toContain('🥲')
  })
})

describe('format helpers', () => {
  it('formats zh-CN compact counts like X web', () => {
    expect(formatCompactCount(90, 'zh-CN')).toBe('90')
    expect(formatCompactCount(14671, 'zh-CN')).toBe('1.4万')
  })

  it('formats zh-CN meta clock like X web', () => {
    expect(formatMetaClock('2026-09-22T15:32:11.000Z', 'zh-CN')).toBe(
      '下午11:32 · 2026年9月22日',
    )
  })
})

describe('tokenizeForWrap / wrapLines', () => {
  it('keeps Latin compounds', () => {
    expect(tokenizeForWrap('tweet-sticker')).toEqual(['tweet-sticker'])
  })

  it('does not break mid-Latin-word', () => {
    const canvas = createCanvas(400, 200)
    const ctx = canvas.getContext('2d')
    const lines = wrapLines(
      ctx as unknown as CanvasRenderingContext2D,
      '前缀 tweet-sticker 后缀',
      200,
    )
    expect(
      lines.some((line) => line.includes('tweet-st') && !line.includes('tweet-sticker')),
    ).toBe(false)
  })

  it('avoids CJK punctuation at line start', () => {
    const fixed = avoidLineStartPunctuation(['今天很好', '，继续写'])
    expect(fixed[1]?.startsWith('，')).toBe(false)
  })
})

describe('cardVisibleText', () => {
  it('respects hideHandle when privacy mode is off', () => {
    expect(
      cardVisibleText(fixture, { privacyMode: false, hideHandle: true, showAuthor: true }).handleLine,
    ).toBeUndefined()
    expect(
      cardVisibleText(fixture, { privacyMode: false, hideHandle: false, showAuthor: true }).handleLine,
    ).toBe('@ninthbit_ai')
  })

  it('shows only the custom name when privacy mode is on', () => {
    expect(cardVisibleText(
      { ...fixture, authorDisplayName: '墙内的我' },
      { privacyMode: true, hideHandle: false, showAuthor: false },
    )).toEqual({
      body: fixture.text.trim(),
      displayName: '墙内的我',
      handleLine: undefined,
    })
  })
})

describe('action icon SVG (live X scrape)', () => {
  it('emits fill=currentColor, 1em, no stroke, scraped paths', async () => {
    const { buildActionIconSvg, X_ACTION_ICON_PATHS } = await import('./xIcons')
    const { buildStatusArticleHtml } = await import('./statusHtml')
    const reply = buildActionIconSvg('reply')
    expect(reply).toContain('fill="currentColor"')
    expect(reply).toContain('width="1em"')
    expect(reply).toContain('height="1em"')
    expect(reply).toContain('viewBox="0 0 24 24"')
    expect(reply).toContain('data-icon="icon-reply-stroke"')
    expect(reply).not.toContain('stroke=')
    expect(reply).toContain(X_ACTION_ICON_PATHS.reply)

    const html = buildStatusArticleHtml(fixture, baseOptions)
    expect(html).toContain('class="header"')
    expect(html).not.toContain('header privacy')
    expect(html).toContain('@ninthbit_ai')
    expect(html).toContain('align-items: flex-start')
    const privateHtml = buildStatusArticleHtml(
      { ...fixture, authorDisplayName: '墙内的我' },
      { ...baseOptions, privacyMode: true },
    )
    expect(privateHtml).toContain('class="header privacy"')
    expect(privateHtml).toContain('墙内的我')
    expect(privateHtml).not.toContain('@ninthbit_ai')
    expect(privateHtml).not.toContain('Kieran Zhang')
    expect(privateHtml).toContain('.header.privacy')
    expect(privateHtml).toContain('align-items: center')
    expect(privateHtml).toContain('fill="#1D9BF0"')
    expect(html).toContain('data-icon="icon-retweet-stroke"')
    expect(html).toContain('data-icon="icon-heart-stroke"')
    expect(html).toContain('data-icon="icon-bookmark-stroke"')
    expect(html).toContain('data-icon="icon-outgoing"')
    expect(html).toContain('font-size: 1.25em')
  })
})

describe('renderCardPng (HTML → Chrome)', () => {
  it('returns PNG matching status-detail pipeline', async () => {
    const bytes = await renderCardPng(fixture, baseOptions)
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(isPng(bytes)).toBe(true)
  }, 60_000)

  it('places a bundled photo behind the white status card', async () => {
    const bytes = await renderCardPng(fixture, {
      ...baseOptions,
      background: { kind: 'image', src: 'backgrounds/hk-harbor.jpg' },
    })
    expect(isPng(bytes)).toBe(true)
    const { createCanvas, loadImage } = await import('@napi-rs/canvas')
    const exported = await loadImage(Buffer.from(bytes))
    expect(exported.width).toBe(1080)
    expect(exported.height).toBe(1440)
    const canvas = createCanvas(exported.width, exported.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(exported, 0, 0)
    const photo = await loadImage(bundledBackgroundFilePath('backgrounds/hk-harbor.jpg'))
    const source = createCanvas(photo.width, photo.height)
    const sourceCtx = source.getContext('2d')
    sourceCtx.imageSmoothingEnabled = false
    sourceCtx.drawImage(photo, 0, 0)
    const corner = ctx.getImageData(12, 12, 1, 1).data
    const expected = sourceCtx.getImageData(12, 102, 1, 1).data
    expect(Math.abs(corner[0]! - expected[0]!)).toBeLessThanOrEqual(2)
    expect(Math.abs(corner[1]! - expected[1]!)).toBeLessThanOrEqual(2)
    expect(Math.abs(corner[2]! - expected[2]!)).toBeLessThanOrEqual(2)
    const inset = Math.round(exported.width * CARD_SIDE_INSET_RATIO)
    const side = ctx.getImageData(12, 720, 1, 1).data
    const sidePhoto = sourceCtx.getImageData(12, 810, 1, 1).data
    expect(Math.abs(side[0]! - sidePhoto[0]!)).toBeLessThanOrEqual(2)
    expect(Math.abs(side[1]! - sidePhoto[1]!)).toBeLessThanOrEqual(2)
    expect(Math.abs(side[2]! - sidePhoto[2]!)).toBeLessThanOrEqual(2)
    const card = ctx.getImageData(inset + 8, 720, 1, 1).data
    expect(card[0]).toBeGreaterThan(240)
    expect(card[1]).toBeGreaterThan(240)
    expect(card[2]).toBeGreaterThan(240)
  }, 60_000)
})

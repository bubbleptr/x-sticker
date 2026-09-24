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
  it('respects hideHandle', () => {
    expect(
      cardVisibleText(fixture, { hideHandle: true, showAuthor: true }).handleLine,
    ).toBeUndefined()
    expect(
      cardVisibleText(fixture, { hideHandle: false, showAuthor: true }).handleLine,
    ).toBe('@ninthbit_ai')
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
})

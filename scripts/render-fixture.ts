/**
 * X web status-detail fixture → vertical white PNG.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { isPng } from '../src/render/card'
import { renderCardPng } from '../src/render/cardNode'
import type { PostText, RenderOptions } from '../src/types'

const out =
  process.argv[2] ?? resolve('/opt/cursor/artifacts/katie_x_web_v6.png')

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

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, bytes)
console.log(JSON.stringify({ out, bytes: bytes.byteLength, png: true }))

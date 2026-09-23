/**
 * X web status-detail fixture (Kieran reference post) → PNG.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { isPng, renderCardPng, type CreateCanvas } from '../src/render/card'
import { ensureNodeCardFonts } from '../src/render/nodeFonts'
import type { PostText, RenderOptions } from '../src/types'

const out =
  process.argv[2] ?? resolve('/opt/cursor/artifacts/katie_x_card_v5.png')

ensureNodeCardFonts()

const avatarUrls = [
  'https://pbs.twimg.com/profile_images/2008017379247247360/CwS3-oAa_bigger.jpg',
  'https://pbs.twimg.com/profile_images/2008017379247247360/CwS3-oAa_normal.jpg',
]

async function loadAvatarOrPlaceholder() {
  for (const url of avatarUrls) {
    try {
      return await loadImage(url)
    } catch {
      // try next
    }
  }
  const av = createCanvas(128, 128)
  const ctx = av.getContext('2d')
  ctx.fillStyle = '#cfd9de'
  ctx.beginPath()
  ctx.arc(64, 64, 64, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#0f1419'
  ctx.font = '700 48px "WenQuanYi Micro Hei"'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('K', 64, 68)
  return av
}

const avatar = await loadAvatarOrPlaceholder()

const post: PostText = {
  text: '我一年内都会无条件看多 Grok！Grok 一定会崛起的！相信老马！\n\n原因无他，我订阅了一年 Heavy',
  authorDisplayName: 'Kieran Zhang',
  handle: 'ninthbit_ai',
  avatarUrl: avatarUrls[0],
  postUrl: 'https://x.com/ninthbit_ai/status/2102420702448234995',
  createdAt: '2026-09-22T15:32:11.000Z',
  verified: true,
  liked: false,
  bookmarked: false,
  stats: {
    replies: 52,
    reposts: 0,
    likes: 90,
    bookmarks: 4,
    views: 14671,
  },
}

const options: RenderOptions = {
  hideHandle: false,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#e7e9ea' },
  locale: 'zh-CN',
  showMenu: true,
}

const nodeCreateCanvas: CreateCanvas = (width, height) =>
  createCanvas(width, height) as unknown as ReturnType<CreateCanvas>

const bytes = await renderCardPng(post, options, nodeCreateCanvas, async () => avatar)
if (!isPng(bytes) || bytes.byteLength < 100) {
  console.error('render failed')
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, bytes)
console.log(JSON.stringify({ out, bytes: bytes.byteLength, png: true }))

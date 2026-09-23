/**
 * Reference-style X card fixture → PNG.
 * Usage: npx tsx scripts/render-fixture.ts [out.png]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { isPng, renderCardPng, type CreateCanvas } from '../src/render/card'
import { ensureNodeCardFonts } from '../src/render/nodeFonts'
import type { PostText, RenderOptions } from '../src/types'

const out =
  process.argv[2] ?? resolve('/opt/cursor/artifacts/katie_x_card_v4.png')

ensureNodeCardFonts()

function makeFakeAvatar() {
  const av = createCanvas(128, 128)
  const ctx = av.getContext('2d')
  ctx.fillStyle = '#111827'
  ctx.beginPath()
  ctx.arc(64, 64, 64, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f9fafb'
  ctx.font = '700 42px "WenQuanYi Micro Hei"'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('不', 64, 68)
  return av
}

const fakeAvatar = makeFakeAvatar()

const post: PostText = {
  text: [
    '很多人以为效率是把日程填满，其实是把注意力留给真正重要的事。',
    '',
    '少做一点，反而更容易把一件事做透。对创作尤其如此——与其每天更新，不如把一个想法写到自己也愿意反复看。',
    '',
    '真正的进步，往往发生在你关掉通知之后。',
  ].join('\n'),
  authorDisplayName: 'dontbesilent',
  handle: 'dontbesilent',
  avatarUrl: 'https://pbs.twimg.com/profile_images/fake/avatar.jpg',
  postUrl: 'https://x.com/dontbesilent/status/1234567890',
  createdAt: '2026-02-01T07:41:00.000Z',
  verified: true,
  liked: true,
  bookmarked: true,
  stats: {
    replies: 40,
    reposts: 83,
    likes: 531,
    bookmarks: 329,
    views: 44000,
  },
}

const options: RenderOptions = {
  hideHandle: false,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'gradient', from: '#64748b', to: '#0f172a' },
}

const nodeCreateCanvas: CreateCanvas = (width, height) =>
  createCanvas(width, height) as unknown as ReturnType<CreateCanvas>

const bytes = await renderCardPng(post, options, nodeCreateCanvas, async () => fakeAvatar)
if (!isPng(bytes) || bytes.byteLength < 100) {
  console.error('render failed: not a valid PNG')
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, bytes)
console.log(JSON.stringify({ out, bytes: bytes.byteLength, png: true }))

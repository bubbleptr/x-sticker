/**
 * VM / local fixture: realistic 中文思考贴 → PNG.
 * Usage: npx tsx scripts/render-fixture.ts [out.png]
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { isPng, renderCardPng, type CreateCanvas } from '../src/render/card'
import { ensureNodeCardFonts } from '../src/render/nodeFonts'
import type { PostText, RenderOptions } from '../src/types'

const out =
  process.argv[2] ?? resolve('/opt/cursor/artifacts/katie_card_v2.png')

ensureNodeCardFonts()

const post: PostText = {
  text:
    '很多人以为效率是把日程填满，其实是把注意力留给真正重要的事。少做一点，反而更容易把一件事做透。对创作尤其如此——与其每天更新，不如把一个想法写到自己也愿意反复看。',
  authorDisplayName: '林间笔记',
  handle: 'linjian_notes',
  postUrl: 'https://x.com/linjian_notes/status/1234567890',
  createdAt: '2026-09-23T12:00:00.000Z',
}

const options: RenderOptions = {
  hideHandle: true,
  showAuthor: true,
  aspect: '3:4',
  background: { kind: 'solid', color: '#f7f4ef' },
}

const nodeCreateCanvas: CreateCanvas = (width, height) =>
  createCanvas(width, height) as unknown as ReturnType<CreateCanvas>

const bytes = await renderCardPng(post, options, nodeCreateCanvas)
if (!isPng(bytes) || bytes.byteLength < 100) {
  console.error('render failed: not a valid PNG')
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, bytes)
console.log(JSON.stringify({ out, bytes: bytes.byteLength, png: true }))

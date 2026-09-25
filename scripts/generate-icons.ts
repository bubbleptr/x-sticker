import { readFile, writeFile } from 'node:fs/promises'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const iconDirectory = new URL('../public/icons/', import.meta.url)
const logo = await loadImage(await readFile(new URL('logo.svg', iconDirectory)))

for (const size of [16, 32, 48, 128]) {
  const canvas = createCanvas(size, size)
  const context = canvas.getContext('2d')
  context.imageSmoothingQuality = 'high'
  context.drawImage(logo, 0, 0, size, size)
  await writeFile(new URL(`icon${size}.png`, iconDirectory), canvas.toBuffer('image/png'))
  console.log(`Generated icon${size}.png (${size}×${size})`)
}

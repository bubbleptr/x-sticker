import { execFileSync } from 'node:child_process'
import { expect, it, vi } from 'vitest'
import { createImageDownload } from './image-download'
import type { ImageAsset } from '../media'

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII='
const cover: ImageAsset = { filename: '01-cover.png', mimeType: 'image/png', dataUrl: `data:image/png;base64,${png}` }
it('downloads a multi-image group as one readable ZIP with the exact original bytes in order', async () => {
  const download = vi.fn(async (_options: { url: string; filename: string; saveAs: boolean }) => 7)
  await createImageDownload(download)([cover, { ...cover, filename: '02-photo.png' }], 'x-sticker.zip')
  expect(download).toHaveBeenCalledTimes(1)
  const request = download.mock.calls[0]![0] as { url: string; filename: string }
  expect(request.filename).toBe('x-sticker.zip')
  const result = JSON.parse(execFileSync('python3', ['-c', 'import sys,io,zipfile,json,base64; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps([[n,base64.b64encode(z.read(n)).decode()] for n in z.namelist()]))'], { input: Buffer.from(request.url.split(',')[1]!, 'base64'), encoding: 'utf8' }))
  expect(result).toEqual([['01-cover.png', png], ['02-photo.png', png]])
})
it('downloads a single original image directly and rejects invalid groups before starting any download', async () => {
  const download = vi.fn(async (_options: { url: string; filename: string; saveAs: boolean }) => 7)
  const save = createImageDownload(download)
  await save([cover], 'x-sticker.zip')
  expect(download).toHaveBeenCalledWith({ url: cover.dataUrl, filename: 'x-sticker.png', saveAs: false })
  download.mockClear()
  await expect(save([cover, { ...cover, filename: '../photo.png' }], 'x-sticker.zip')).rejects.toThrow()
  await expect(save([cover, cover], '../x-sticker.zip')).rejects.toThrow()
  expect(download).not.toHaveBeenCalled()
})

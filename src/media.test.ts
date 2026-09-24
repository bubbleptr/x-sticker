import { describe, expect, it } from 'vitest'
import { decodeImageAsset, encodeImageAsset, validateImageAssets, type ImageAsset } from './media'

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64'))

describe('image assets', () => {
  it('preserves original bytes across message serialization', () => {
    const asset = encodeImageAsset(png, 'image/png', 'post-02.png')
    const serialized: ImageAsset = JSON.parse(JSON.stringify(asset))
    expect(decodeImageAsset(serialized)).toEqual(png)
    expect(serialized.filename).toBe('post-02.png')
    expect(serialized.dataUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('rejects unsafe filenames, forged MIME and malformed base64 before consuming attachments', () => {
    const asset = encodeImageAsset(png, 'image/png', 'post-02.png')
    for (const filename of ['../post.png', 'dir/post.png', 'dir\\post.png', '.hidden.png', 'a\n.png']) {
      expect(() => decodeImageAsset({ ...asset, filename })).toThrow(/文件名/)
    }
    expect(() => decodeImageAsset({ ...asset, mimeType: 'image/jpeg' })).toThrow(/格式/)
    expect(() => decodeImageAsset(encodeImageAsset(png, 'image/jpeg', 'post.jpg'))).toThrow(/格式/)
    expect(() => decodeImageAsset({ ...asset, dataUrl: 'data:image/png;base64,aGVsbG8=' })).toThrow(/格式/)
    for (const dataUrl of ['data:image/png;base64,@@@=', 'data:image/png;base64,iVBORw0KGgo', 'https://example.com/photo.png']) {
      expect(() => decodeImageAsset({ ...asset, dataUrl })).toThrow(/编码|格式/)
    }
  })

  it('rejects truncated files even when their image signatures look correct', () => {
    expect(() => decodeImageAsset(encodeImageAsset(png.subarray(0, 8), 'image/png', 'cut.png'))).toThrow(/格式|完整/)
    expect(() => decodeImageAsset(encodeImageAsset(png.subarray(0, png.length - 12), 'image/png', 'cut.png'))).toThrow(/格式|完整/)
    expect(() => decodeImageAsset(encodeImageAsset(new Uint8Array([255, 216, 255, 224, 0, 2]), 'image/jpeg', 'cut.jpg'))).toThrow(/格式|完整/)
    const invalidWebp = new Uint8Array([82, 73, 70, 70, 100, 0, 0, 0, 87, 69, 66, 80])
    expect(() => decodeImageAsset(encodeImageAsset(invalidWebp, 'image/webp', 'cut.webp'))).toThrow(/格式|完整/)
  })

  it('bounds decoded image size, image count and total transfer size', () => {
    const small = encodeImageAsset(png, 'image/png', 'post.png')
    expect(() => validateImageAssets([small])).not.toThrow()
    expect(() => validateImageAssets([])).toThrow(/至少.*一张/)
    expect(() => validateImageAssets(Array.from({ length: 21 }, () => small))).toThrow(/20/)
    const oversized = new Uint8Array(20 * 1024 * 1024 + 1)
    oversized.set(png)
    expect(() => decodeImageAsset(encodeImageAsset(oversized, 'image/png', 'large.png'))).toThrow(/20.*MiB/)
    const largeBytes = new Uint8Array(15 * 1024 * 1024)
    largeBytes.set([255, 216, 255, 224])
    largeBytes.set([255, 217], largeBytes.length - 2)
    const large = encodeImageAsset(largeBytes, 'image/jpeg', 'large.jpg')
    expect(() => validateImageAssets([large, large, large])).toThrow(/40.*MiB/)
  })
})

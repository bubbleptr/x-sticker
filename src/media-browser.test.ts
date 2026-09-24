/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeImageAsset, loadPostPhoto } from './media'

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64'))

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('post photo decoding', () => {
  it('rejects a broken downloaded image and surfaces background errors', async () => {
    const image = encodeImageAsset(png, 'image/png', 'post.png')
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, image })
    vi.stubGlobal('chrome', { runtime: { sendMessage } })
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockRejectedValue(new Error('decode failed'))
    await expect(loadPostPhoto('https://pbs.twimg.com/media/a', 'post')).rejects.toThrow(/图片.*损坏|配图.*解码/)
    sendMessage.mockResolvedValueOnce({ ok: false, error: '配图读取超时，请重试' })
    await expect(loadPostPhoto('https://pbs.twimg.com/media/a', 'post')).rejects.toThrow('配图读取超时，请重试')
  })

  it('only returns image assets with usable natural dimensions', async () => {
    const image = encodeImageAsset(png, 'image/png', 'post.png')
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true, image }) } })
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(0)
    await expect(loadPostPhoto('https://pbs.twimg.com/media/a', 'post')).rejects.toThrow(/尺寸/)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1)
    vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1)
    await expect(loadPostPhoto('https://pbs.twimg.com/media/a', 'post')).resolves.toEqual(image)
  })
})

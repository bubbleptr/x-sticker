import { describe, expect, it, vi } from 'vitest'
import { createPhotoLoader } from './photo-loader'
import { decodeImageAsset } from '../media'

const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64'))

describe('post photo loading', () => {
  it('retrieves original bytes without cookies and uses the response format for the filename', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(png, { headers: { 'content-type': 'image/png' } }))
    const image = await createPhotoLoader(fetchFn)('https://pbs.twimg.com/media/photo?format=jpg&name=small', 'post-02')
    expect(image.filename).toBe('post-02.png')
    expect(decodeImageAsset(image)).toEqual(png)
    expect(fetchFn).toHaveBeenCalledWith('https://pbs.twimg.com/media/photo?format=jpg&name=orig', expect.objectContaining({ credentials: 'omit', redirect: 'error' }))
  })

  it('rejects unrelated sources, redirects, unsafe filenames and false image responses', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async () => new Response(png, { headers: { 'content-type': 'image/png' } }))
    const load = createPhotoLoader(fetchFn)
    for (const url of ['http://pbs.twimg.com/media/a', 'https://pbs.twimg.com.evil.test/media/a', 'https://pbs.twimg.com/profile_images/a', 'https://pbs.twimg.com:8443/media/a', 'https://user:pass@pbs.twimg.com/media/a']) {
      await expect(load(url, 'post')).rejects.toThrow(/来源/)
    }
    await expect(load('https://pbs.twimg.com/media/a', '../post')).rejects.toThrow(/文件名/)
    expect(fetchFn).not.toHaveBeenCalled()
    fetchFn.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://example.com/file' } }))
    await expect(load('https://pbs.twimg.com/media/a', 'post')).rejects.toThrow(/重定向|302/)
    fetchFn.mockResolvedValueOnce(new Response('error', { headers: { 'content-type': 'text/html' } }))
    await expect(load('https://pbs.twimg.com/media/a', 'post')).rejects.toThrow(/格式/)
    fetchFn.mockResolvedValueOnce(new Response('not an image', { headers: { 'content-type': 'image/png' } }))
    await expect(load('https://pbs.twimg.com/media/a', 'post')).rejects.toThrow(/格式/)
  })

  it('stops oversized responses before reading their bodies and cancels oversized streams', async () => {
    const large = new Response(png, {
      headers: { 'content-type': 'image/png', 'content-length': String(21 * 1024 * 1024) },
    })
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(large)
    await expect(createPhotoLoader(fetchFn)('https://pbs.twimg.com/media/a', 'post')).rejects.toThrow(/20.*MiB/)
    expect(large.body?.locked).toBe(false)
    let canceled = false
    let count = 0
    const chunk = new Uint8Array(1024 * 1024)
    chunk.set(png)
    fetchFn.mockResolvedValueOnce(new Response(new ReadableStream({
      pull(controller) { count += 1; controller.enqueue(chunk); if (count === 24) controller.close() },
      cancel() { canceled = true },
    }), { headers: { 'content-type': 'image/png' } }))
    await expect(createPhotoLoader(fetchFn)('https://pbs.twimg.com/media/a', 'post')).rejects.toThrow(/20.*MiB/)
    expect(canceled).toBe(true)
    expect(count).toBeLessThanOrEqual(22)
  })

  it('times out an unresponsive source with a user-readable error', async () => {
    vi.useFakeTimers()
    try {
      const fetchFn: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
      const pending = createPhotoLoader(fetchFn)('https://pbs.twimg.com/media/a', 'post')
      const rejection = expect(pending).rejects.toThrow(/超时/)
      await vi.advanceTimersByTimeAsync(15_000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })
})

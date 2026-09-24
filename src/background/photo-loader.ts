import { decodeImageAsset, encodeImageAsset, MAX_IMAGE_BYTES, type ImageAsset, type ImageMimeType } from '../media'

export function createPhotoLoader(fetchFn: typeof fetch = fetch) {
  return async (url: string, filenameStem: string): Promise<ImageAsset> => {
    let source: URL
    try {
      source = new URL(url)
    } catch {
      throw new Error('配图来源无效')
    }
    if (source.origin !== 'https://pbs.twimg.com' || !/^\/media\/[^/]+$/.test(source.pathname) || source.username || source.password) {
      throw new Error('配图来源无效，只支持 X 帖子的静态配图')
    }
    if (typeof filenameStem !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,170}$/.test(filenameStem)) throw new Error('图片文件名无效')
    source.searchParams.set('name', 'orig')
    source.hash = ''
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetchFn(source.href, { credentials: 'omit', redirect: 'error', signal: controller.signal })
      if (response.redirected) throw new Error('配图读取不允许重定向')
      if (!response.ok) throw new Error(`配图读取失败（HTTP ${response.status}）`)
      const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() as ImageMimeType
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mimeType]
      if (!extension) throw new Error('配图格式不支持，只支持 PNG、JPEG 和 WebP')
      if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
        await response.body?.cancel()
        throw new Error('单张图片不能超过 20 MiB')
      }
      if (!response.body) throw new Error('配图内容为空')
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_IMAGE_BYTES) {
            await reader.cancel()
            throw new Error('单张图片不能超过 20 MiB')
          }
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      const image = encodeImageAsset(bytes, mimeType, `${filenameStem}.${extension}`)
      decodeImageAsset(image)
      return image
    } catch (error) {
      if (controller.signal.aborted) throw new Error('配图读取超时，请重试')
      if (error instanceof TypeError) throw new Error('配图读取失败，请检查网络后重试')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }
}

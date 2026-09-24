export async function fingerprintImage(image: HTMLImageElement | null): Promise<string> {
  if (!image?.isConnected || !image.complete || !image.naturalWidth || !image.naturalHeight) {
    throw new Error('图片尚未加载完成，无法核对，请检查后继续')
  }
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width * height > 24_000_000) throw new Error('图片尺寸超出自动核对范围，请手动核对草稿')
  const canvas = image.ownerDocument.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法读取图片内容，请手动核对草稿')
  let pixels: Uint8ClampedArray
  try {
    context.drawImage(image, 0, 0)
    pixels = context.getImageData(0, 0, width, height).data
  } catch {
    throw new Error('平台限制读取图片内容，请手动核对草稿')
  }
  // Include dimensions so differently shaped images cannot share the same pixel stream.
  const input = new Uint8Array(8 + pixels.byteLength)
  const dimensions = new DataView(input.buffer)
  dimensions.setUint32(0, width)
  dimensions.setUint32(4, height)
  input.set(pixels, 8)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

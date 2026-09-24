export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 40 * 1024 * 1024

export type ImageAsset = {
  filename: string
  mimeType: ImageMimeType
  dataUrl: string
}

export type LoadPostPhotoResponse =
  | { ok: true; image: ImageAsset }
  | { ok: false; error: string }

export function encodeImageAsset(bytes: Uint8Array, mimeType: ImageMimeType, filename: string): ImageAsset {
  const parts: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
  }
  return { filename, mimeType, dataUrl: `data:${mimeType};base64,${btoa(parts.join(''))}` }
}

function hasCompletePng(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let hasPixels = false
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset)
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    if (offset + size + 12 > bytes.length) return false
    if (offset === 8 && (kind !== 'IHDR' || size !== 13 || view.getUint32(16) === 0 || view.getUint32(20) === 0)) return false
    if (kind === 'IDAT' && size > 0) hasPixels = true
    if (kind === 'IEND') return size === 0 && hasPixels && offset + 12 === bytes.length
    offset += size + 12
  }
  return false
}

export function decodeImageAsset(asset: ImageAsset): Uint8Array {
  if (!asset || typeof asset.filename !== 'string' || !asset.filename || asset.filename.length > 180
    || asset.filename.startsWith('.') || /[<>:"/\\|?*\x00-\x1f]/.test(asset.filename)) {
    throw new Error('图片文件名无效')
  }
  const extensions: Record<ImageMimeType, RegExp> = {
    'image/png': /\.png$/i,
    'image/jpeg': /\.jpe?g$/i,
    'image/webp': /\.webp$/i,
  }
  if (!Object.hasOwn(extensions, asset.mimeType) || !extensions[asset.mimeType].test(asset.filename)) {
    throw new Error('图片格式与文件名不一致，只支持 PNG、JPEG 和 WebP')
  }
  const prefix = `data:${asset.mimeType};base64,`
  if (typeof asset.dataUrl !== 'string' || !asset.dataUrl.startsWith(prefix)) throw new Error('图片格式无效')
  const payload = asset.dataUrl.slice(prefix.length)
  if (payload.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error('单张图片不能超过 20 MiB')
  if (!payload || payload.length % 4 !== 0 || /[^a-zA-Z0-9+/=]/.test(payload)) throw new Error('图片编码无效')
  let binary: string
  try {
    binary = atob(payload)
  } catch {
    throw new Error('图片编码无效')
  }
  if (btoa(binary) !== payload) throw new Error('图片编码无效')
  if (binary.length > MAX_IMAGE_BYTES) throw new Error('单张图片不能超过 20 MiB')
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const signatureMatches = asset.mimeType === 'image/png'
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    : asset.mimeType === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : binary.startsWith('RIFF') && binary.slice(8, 12) === 'WEBP'
  if (!signatureMatches) throw new Error('图片内容与声明的格式不一致')
  const complete = asset.mimeType === 'image/png'
    ? hasCompletePng(bytes)
    : asset.mimeType === 'image/jpeg'
      ? bytes.length >= 4 && bytes.at(-2) === 255 && bytes.at(-1) === 217
      : bytes.length >= 20 && new DataView(bytes.buffer).getUint32(4, true) + 8 === bytes.length
  if (!complete) throw new Error('图片内容不完整，请重新读取')
  return bytes
}

export function validateImageAssets(images: ImageAsset[]): void {
  if (!Array.isArray(images) || !images.length) throw new Error('请至少选择一张图片')
  if (images.length > 20) throw new Error('一组最多支持 20 张图片')
  let total = 0
  for (const image of images) {
    total += decodeImageAsset(image).byteLength
    if (total > MAX_TOTAL_IMAGE_BYTES) throw new Error('整组图片不能超过 40 MiB，请减少配图后重试')
  }
}

export async function loadPostPhoto(url: string, filenameStem: string): Promise<ImageAsset> {
  const response: LoadPostPhotoResponse = await chrome.runtime.sendMessage({ type: 'LOAD_POST_PHOTO', url, filenameStem })
  if (!response) throw new Error('配图读取失败，请刷新页面后重试')
  if (!response.ok) throw new Error(response.error)
  decodeImageAsset(response.image)
  const image = new Image()
  image.src = response.image.dataUrl
  try {
    await image.decode()
  } catch {
    throw new Error('配图解码失败，图片可能已损坏，请重试或取消这张配图')
  }
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('配图尺寸无效，请重试或取消这张配图')
  return response.image
}

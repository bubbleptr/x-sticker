import { decodeImageAsset, validateImageAssets, type ImageAsset } from '../media'

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  return crc >>> 0
})

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!
  return (crc ^ 0xffffffff) >>> 0
}

function zipImages(images: ImageAsset[]): Uint8Array {
  const files: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let fileOffset = 0
  let directoryLength = 0
  for (const image of images) {
    const name = new TextEncoder().encode(image.filename)
    const bytes = decodeImageAsset(image)
    const crc = crc32(bytes)
    // PNG/JPEG/WebP are already compressed; STORE preserves the original bytes.
    const local = new Uint8Array(30 + name.length)
    const header = new DataView(local.buffer)
    header.setUint32(0, 0x04034b50, true)
    header.setUint16(4, 20, true)
    header.setUint16(6, 0x0800, true)
    header.setUint16(12, 0x21, true)
    header.setUint32(14, crc, true)
    header.setUint32(18, bytes.length, true)
    header.setUint32(22, bytes.length, true)
    header.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const entry = new DataView(central.buffer)
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint16(14, 0x21, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, bytes.length, true)
    entry.setUint32(24, bytes.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, fileOffset, true)
    central.set(name, 46)
    files.push(local, bytes)
    directory.push(central)
    fileOffset += local.length + bytes.length
    directoryLength += central.length
  }
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, images.length, true)
  endView.setUint16(10, images.length, true)
  endView.setUint32(12, directoryLength, true)
  endView.setUint32(16, fileOffset, true)
  const output = new Uint8Array(fileOffset + directoryLength + end.length)
  let offset = 0
  for (const chunk of [...files, ...directory, end]) { output.set(chunk, offset); offset += chunk.length }
  return output
}

export function createImageDownload(download: (options: { url: string; filename: string; saveAs: boolean }) => Promise<number>) {
  return async (images: ImageAsset[], filename: string): Promise<void> => {
    validateImageAssets(images)
    if (typeof filename !== 'string' || filename.startsWith('.') || !/^[^<>:"/\\|?*\x00-\x1f]{1,150}\.zip$/i.test(filename)) throw new Error('下载文件名无效')
    if (new Set(images.map((image) => image.filename)).size !== images.length) throw new Error('整组图片文件名不能重复')
    if (images.length === 1) {
      const image = images[0]!
      await download({ url: image.dataUrl, filename: filename.replace(/\.zip$/i, `.${image.mimeType.split('/')[1]!.replace('jpeg', 'jpg')}`), saveAs: false })
      return
    }
    const bytes = zipImages(images)
    const parts: string[] = []
    for (let index = 0; index < bytes.length; index += 0x8000) parts.push(String.fromCharCode(...bytes.subarray(index, index + 0x8000)))
    await download({ url: `data:application/zip;base64,${btoa(parts.join(''))}`, filename, saveAs: false })
  }
}

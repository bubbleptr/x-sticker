import { describe, expect, it } from 'vitest'
import { pngBytesToDataUrl } from './png-data-url'

describe('pngBytesToDataUrl', () => {
  it('round-trips bytes longer than one encode chunk', () => {
    const bytes = new Uint8Array(40_000)
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251
    const url = pngBytesToDataUrl(bytes)
    const b64 = url.slice('data:image/png;base64,'.length)
    expect(url.startsWith('data:image/png;base64,')).toBe(true)
    expect(Array.from(Uint8Array.from(Buffer.from(b64, 'base64')))).toEqual(Array.from(bytes))
  })
})

import { vi } from 'vitest'

export function mockSuccessfulBrowserImages(): void {
  class LoadedImage {
    naturalWidth = 1080
    naturalHeight = 1440
    onload: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null
    private source = ''
    get src() { return this.source }
    set src(value: string) {
      this.source = value
      queueMicrotask(() => this.onload?.(new Event('load')))
    }
    decode() { return Promise.resolve() }
    removeAttribute() { this.source = '' }
  }
  vi.stubGlobal('Image', LoadedImage)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
}

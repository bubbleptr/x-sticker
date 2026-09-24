export function createPreviewController(canvas: HTMLCanvasElement, viewport: HTMLElement) {
  let generation = 0
  let pending: { cancel: () => void } | null = null

  function layout() {
    const style = getComputedStyle(viewport)
    const width = viewport.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
    const height = viewport.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0')
    if (width <= 0 || height <= 0) return
    const scale = Math.min(width / canvas.width, height / canvas.height, 1)
    canvas.style.width = `${canvas.width * scale}px`
    canvas.style.height = `${canvas.height * scale}px`
  }

  const observer = new ResizeObserver(layout)
  observer.observe(viewport)
  layout()

  return {
    paint(source: Uint8Array | string): Promise<boolean> {
      pending?.cancel()
      const current = ++generation
      const objectUrl = typeof source !== 'string'
      const url = objectUrl ? URL.createObjectURL(new Blob([Uint8Array.from(source)], { type: 'image/png' })) : source
      return new Promise((resolve, reject) => {
        const image = new Image()
        let settled = false
        const finish = (drawn: boolean, error?: Error) => {
          if (settled) return
          settled = true
          image.onload = null
          image.onerror = null
          image.removeAttribute('src')
          if (objectUrl) URL.revokeObjectURL(url)
          if (current === generation) pending = null
          if (error) reject(error)
          else resolve(drawn)
        }
        pending = { cancel: () => finish(false) }
        image.onload = () => {
          if (current !== generation) { finish(false); return }
          try {
            if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效')
            // Scale only the display size to retain every exported pixel.
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight
            const context = canvas.getContext('2d')
            if (!context) throw new Error('无法创建图片画布')
            context.drawImage(image, 0, 0)
            layout()
            finish(true)
          } catch {
            finish(false, new Error('图片预览失败，请重试'))
          }
        }
        image.onerror = () => finish(false, new Error('图片预览加载失败，请重试'))
        image.src = url
      })
    },
    destroy(): void {
      pending?.cancel()
      generation++
      observer.disconnect()
    },
  }
}

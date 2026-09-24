export function createPreviewController(canvas: HTMLCanvasElement, viewport: HTMLElement) {
  let generation = 0
  let pendingUrl: string | null = null

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
    paint(bytes: Uint8Array): void {
      const current = ++generation
      if (pendingUrl) URL.revokeObjectURL(pendingUrl)
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }))
      pendingUrl = url
      const image = new Image()
      const release = () => {
        URL.revokeObjectURL(url)
        if (pendingUrl === url) pendingUrl = null
      }
      image.onload = () => {
        if (current !== generation) { release(); return }
        // Scale only the display size to retain every exported pixel.
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        canvas.getContext('2d')?.drawImage(image, 0, 0)
        release()
        layout()
      }
      image.onerror = release
      image.src = url
    },
    destroy(): void {
      generation++
      observer.disconnect()
      if (pendingUrl) URL.revokeObjectURL(pendingUrl)
      pendingUrl = null
    },
  }
}

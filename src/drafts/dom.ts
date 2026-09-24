const SAVE_LABELS = new Set(['保存草稿', '存草稿', '暂存离开'])

export function waitForValue<T>(read: () => T | null | undefined | false, label: string, timeout = 30000, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const finish = (error?: unknown, value?: T) => {
      observer.disconnect()
      clearTimeout(timer)
      clearInterval(poll)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(value as T)
    }
    const abort = () => finish(signal?.reason ?? new DOMException('操作已停止', 'AbortError'))
    const check = () => {
      try {
        const value = read()
        if (value !== null && value !== undefined && value !== false) finish(undefined, value)
      } catch (error) { finish(error) }
    }
    const observer = new MutationObserver(check)
    const timer = setTimeout(() => finish(new Error(`等待${label}超时，请打开后台接手`)), timeout)
    // Image decode and input properties may change without a DOM mutation.
    const poll = setInterval(check, 250)
    signal?.addEventListener('abort', abort, { once: true })
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true })
    check()
  })
}

export function isVisible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (node.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden') return false
  }
  return element.isConnected
}

function isSaveDraft(element: Element): boolean {
  return SAVE_LABELS.has(element.textContent?.replace(/\s+/g, '').trim() ?? '')
}

export function findSaveDraftButton(root: ParentNode): HTMLElement | null {
  const matches = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .filter((element) => isVisible(element) && isSaveDraft(element))
  if (matches.length > 1) throw new Error('出现多个草稿保存按钮，请手动接手')
  return matches[0] ?? null
}

export function clickSaveDraft(button: HTMLElement): void {
  const label = button.textContent?.replace(/\s+/g, '').trim()
  if (!label || !isSaveDraft(button)) {
    throw new Error('未找到明确的草稿保存操作，请手动接手')
  }
  if (button.matches(':disabled, [aria-disabled="true"]') || !button.isConnected) {
    throw new Error('草稿保存按钮尚不可用')
  }
  button.click()
}

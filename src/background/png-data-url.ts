export function pngBytesToDataUrl(bytes: Uint8Array): string {
  const parts: string[] = []
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunk)))
  }
  return `data:image/png;base64,${btoa(parts.join(''))}`
}

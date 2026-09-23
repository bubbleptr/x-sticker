import { existsSync } from 'node:fs'
import { GlobalFonts } from '@napi-rs/canvas'

const FONT_CANDIDATES: Array<{ path: string; familyHint: string }> = [
  { path: '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', familyHint: 'WenQuanYi Micro Hei' },
  { path: '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf', familyHint: 'Droid Sans Fallback' },
  { path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', familyHint: 'Noto Sans CJK SC' },
  { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', familyHint: 'DejaVu Sans' },
]

let registered = false

/** Register CJK-capable fonts for Node (@napi-rs/canvas) renders / tests. */
export function ensureNodeCardFonts(): void {
  if (registered) return
  for (const { path } of FONT_CANDIDATES) {
    if (!existsSync(path)) continue
    try {
      GlobalFonts.registerFromPath(path)
    } catch {
      // Skip unreadable faces; others may still work.
    }
  }
  registered = true
}

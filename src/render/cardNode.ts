import type { PostText, RenderOptions } from '../types'
import { renderStatusPngViaChrome } from './rasterize'

/** Node-only PNG render via headless Chrome (exact X HTML/CSS + SVG icons). */
export async function renderCardPngNode(
  post: PostText,
  options: RenderOptions,
): Promise<Uint8Array> {
  return renderStatusPngViaChrome(post, options)
}

export { renderCardPngNode as renderCardPng }

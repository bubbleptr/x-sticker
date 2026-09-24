import { fileURLToPath } from 'node:url'
import { isBundledBackgroundFile, type BundledBackgroundFile } from '../photoBackgrounds'

/** Absolute path to a photo shipped in `public/`. Node render and tests only. */
export function bundledBackgroundFilePath(src: BundledBackgroundFile): string {
  if (!isBundledBackgroundFile(src)) {
    throw new Error(`unknown background: ${src}`)
  }
  return fileURLToPath(new URL(`../../public/${src}`, import.meta.url))
}

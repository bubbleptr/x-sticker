import type { PostText, RenderOptions } from '../types'

export type CardIdentity = {
  privacyMode: boolean
  displayName?: string
  handleLine?: string
}

/** Identity line shown on the sticker. Privacy mode never includes the X handle. */
export function resolveCardIdentity(
  post: PostText,
  options: Pick<RenderOptions, 'privacyMode' | 'hideHandle' | 'showAuthor'>,
): CardIdentity {
  if (options.privacyMode) {
    const displayName = post.authorDisplayName?.trim() || undefined
    return { privacyMode: true, displayName, handleLine: undefined }
  }
  const displayName =
    options.showAuthor && post.authorDisplayName?.trim()
      ? post.authorDisplayName.trim()
      : undefined
  const handleLine =
    !options.hideHandle && post.handle?.trim()
      ? `@${post.handle.trim().replace(/^@+/, '')}`
      : undefined
  return { privacyMode: false, displayName, handleLine }
}

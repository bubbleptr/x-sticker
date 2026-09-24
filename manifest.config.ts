import { defineManifest } from '@crxjs/vite-plugin'
import { BUNDLED_BACKGROUND_FILES } from './src/photoBackgrounds'

export default defineManifest({
  manifest_version: 3,
  name: 'X Sticker',
  short_name: 'X Sticker',
  description: '把 X/Twitter 文字贴转成竖版引用图并下载 PNG',
  version: '0.1.0',
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'X Sticker',
  },
  background: {
    service_worker: 'src/background/sw.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://x.com/*', 'https://twitter.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['activeTab', 'downloads'],
  host_permissions: [
    'https://x.com/*',
    'https://twitter.com/*',
    'https://pbs.twimg.com/*',
    'https://abs.twimg.com/*',
  ],
  web_accessible_resources: [
    {
      resources: [...BUNDLED_BACKGROUND_FILES],
      matches: ['https://x.com/*', 'https://twitter.com/*'],
    },
  ],
  icons: {
    '16': 'public/icons/icon16.png',
    '48': 'public/icons/icon48.png',
    '128': 'public/icons/icon128.png',
  },
})

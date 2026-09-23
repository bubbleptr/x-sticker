export const BACKGROUND_PRESETS: Array<{
  id: string
  label: string
  background: import('../types').Background
}> = [
  {
    id: 'white',
    label: '纯白',
    background: { kind: 'solid', color: '#ffffff' },
  },
  {
    id: 'xgray',
    label: '浅灰',
    background: { kind: 'solid', color: '#e7e9ea' },
  },
  {
    id: 'xblue',
    label: '天蓝渐变',
    background: { kind: 'gradient', from: '#1d9bf0', to: '#0c4a6e' },
  },
  {
    id: 'ink',
    label: '墨黑',
    background: { kind: 'solid', color: '#0f1419' },
  },
]

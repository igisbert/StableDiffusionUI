import { convertFileSrc } from '@tauri-apps/api/core'

export function showPreview(imagePath) {
  const img = document.getElementById('preview-img')
  const placeholder = document.getElementById('canvas-placeholder')
  img.src = convertFileSrc(imagePath)
  img.style.display = 'block'
  placeholder.style.display = 'none'
}

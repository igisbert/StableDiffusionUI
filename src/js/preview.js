import { convertFileSrc } from '@tauri-apps/api/core'

export function showPreview(paths) {
  const img = document.getElementById('preview-img')
  const placeholder = document.getElementById('canvas-placeholder')
  const gallery = document.getElementById('preview-gallery')

  const files = Array.isArray(paths) ? paths : [paths]

  placeholder.style.display = 'none'

  if (files.length === 1) {
    gallery.style.display = 'none'
    gallery.innerHTML = ''
    img.src = convertFileSrc(files[0])
    img.style.display = 'block'
    return
  }

  img.style.display = 'none'
  gallery.innerHTML = ''
  gallery.style.display = 'flex'

  files.forEach((path, i) => {
    const thumb = document.createElement('div')
    thumb.className = 'preview-thumb' + (i === 0 ? ' active' : '')
    thumb.innerHTML = `<img src="${convertFileSrc(path)}" />`
    thumb.addEventListener('click', () => {
      gallery.querySelectorAll('.preview-thumb').forEach(t => t.classList.remove('active'))
      thumb.classList.add('active')
      img.src = convertFileSrc(path)
      img.style.display = 'block'
    })
    gallery.appendChild(thumb)
  })

  img.src = convertFileSrc(files[0])
  img.style.display = 'block'
}

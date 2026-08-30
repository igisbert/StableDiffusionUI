import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getUpscannersPath } from '../config.js'
import { getSelectedImageState, setSelectedImageState } from '../state/image-state.js'
import { updateImageOpUI, refreshInpaintCanvas, clearInpaintState } from './image-op.js'

export function getSelectedImageForOp() {
  return getSelectedImageState()
}

function getImageDimensions(url, { timeoutMs = 10000, revoke = false } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Timeout leyendo dimensiones de imagen'))
    }, timeoutMs)
    function cleanup() {
      clearTimeout(timer)
      if (revoke) URL.revokeObjectURL(url)
    }
    img.onload = () => {
      cleanup()
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      cleanup()
      reject(new Error('No se pudo cargar la imagen'))
    }
    img.src = url
  })
}

function applyImageSize(factor) {
  const img = getSelectedImageState()
  if (!img) return
  const imageUrl = convertFileSrc(img)
  getImageDimensions(imageUrl).then(({ width, height }) => {
    document.getElementById('input-width').value = Math.round(width * factor)
    document.getElementById('input-height').value = Math.round(height * factor)
  }).catch(e => console.error('Error leyendo dimensiones:', e))
}

export function initImageInput({ onImageChange } = {}) {
  const btnToggleImageInput = document.getElementById('btn-toggle-image-input')
  const imageInputContent = document.getElementById('image-input-content')
  const btnSelectImage = document.getElementById('btn-select-image')
  const imageName = document.getElementById('image-input-name')

  document.querySelectorAll('.size-btn[data-factor]').forEach(btn => {
    btn.addEventListener('click', () => {
      const factor = parseFloat(btn.dataset.factor)
      if (!isNaN(factor)) applyImageSize(factor)
    })
  })

  btnToggleImageInput.addEventListener('click', () => {
    const open = btnToggleImageInput.classList.toggle('open')
    btnToggleImageInput.setAttribute('aria-expanded', String(open))
    imageInputContent.classList.toggle('open')
  })

  btnSelectImage.addEventListener('click', async () => {
    const path = await invoke('pick_file')
    if (!path) return
    setSelectedImageState(path)
    const name = path.split(/[/\\]/).pop()
    imageName.textContent = name
    document.getElementById('btn-clear-image').classList.add('visible')
    updateImageOpUI()
    await refreshInpaintCanvas()
    onImageChange?.(path)
  })

  document.getElementById('btn-clear-image').addEventListener('click', () => {
    setSelectedImageState(null)
    imageName.textContent = 'Ninguna'
    document.getElementById('btn-clear-image').classList.remove('visible')
    updateImageOpUI()
    clearInpaintState()
    onImageChange?.(null)
  })

  const dropZone = document.getElementById('image-drop-zone')
  const validImageExts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp']

  listen('tauri://drag-over', (event) => {
    const pos = event.payload?.position
    if (!pos) return
    const rect = dropZone.getBoundingClientRect()
    const over = pos.x >= rect.left && pos.x <= rect.right && pos.y >= rect.top && pos.y <= rect.bottom
    dropZone.classList.toggle('dragover', over)
  })

  listen('tauri://drag-leave', () => {
    dropZone.classList.remove('dragover')
  })

  listen('tauri://drag-drop', (event) => {
    dropZone.classList.remove('dragover')
    const paths = event.payload?.paths
    if (!paths || paths.length === 0) return
    const filePath = paths[0]
    const ext = '.' + filePath.split('.').pop().toLowerCase()
    if (!validImageExts.includes(ext)) return
    setSelectedImageState(filePath)
    const name = filePath.split(/[/\\]/).pop()
    imageName.textContent = name
    document.getElementById('btn-clear-image').classList.add('visible')
    updateImageOpUI()
    refreshInpaintCanvas()
    onImageChange?.(filePath)
  })

  populateImageUpscaleModels()
}

async function populateImageUpscaleModels() {
  const upscalersPath = await getUpscannersPath()
  if (!upscalersPath) return
  try {
    const result = await invoke('scan_models', { basePath: upscalersPath })
    const container = document.getElementById('radio-image-upscale-models')
    if (!container) return
    container.innerHTML = ''
    for (const item of result.models) {
      const label = document.createElement('label')
      const input = document.createElement('input')
      input.type = 'radio'
      input.name = 'image-upscale-model'
      input.value = item
      input.addEventListener('change', updateImageOpUI)
      label.appendChild(input)
      label.appendChild(document.createTextNode(item))
      container.appendChild(label)
    }
  } catch (e) {
    console.error('Error scanning upscalers:', e)
  }
}

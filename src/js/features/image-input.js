import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getUpscannersPath } from '../config.js'
import { getSelectedImageState, setSelectedImageState } from '../state/image-state.js'
import { loadInpaintImage, resetInpaint, isMaskPainted } from '../inpaint.js'

let selectedImageForOp = null

function getSelectedImage() {
  return getSelectedImageState()
}

export function getSelectedImageForOp() {
  return getSelectedImageState()
}

let btnRunUpscale
let btnOpenInpaint

export function initImageInput({ onImageChange } = {}) {
  const btnToggleImageInput = document.getElementById('btn-toggle-image-input')
  const imageInputContent = document.getElementById('image-input-content')
  const btnSelectImage = document.getElementById('btn-select-image')
  const imageName = document.getElementById('image-input-name')
  btnRunUpscale = document.getElementById('btn-run-upscale')
  btnOpenInpaint = document.getElementById('btn-open-inpaint')

  const btnSizeFull = document.getElementById('btn-size-full')
  const btnSizeThreeQuarter = document.getElementById('btn-size-three-quarter')
  const btnSizeHalf = document.getElementById('btn-size-half')
  const btnSizeQuarter = document.getElementById('btn-size-quarter')
  const btnInpaintSizeFull = document.getElementById('btn-inpaint-size-full')
  const btnInpaintSizeThreeQuarter = document.getElementById('btn-inpaint-size-three-quarter')
  const btnInpaintSizeHalf = document.getElementById('btn-inpaint-size-half')
  const btnInpaintSizeQuarter = document.getElementById('btn-inpaint-size-quarter')
  const btnEditSizeFull = document.getElementById('btn-edit-size-full')
  const btnEditSizeThreeQuarter = document.getElementById('btn-edit-size-three-quarter')
  const btnEditSizeHalf = document.getElementById('btn-edit-size-half')
  const btnEditSizeQuarter = document.getElementById('btn-edit-size-quarter')

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

  btnSizeFull.addEventListener('click', () => applyImageSize(1))
  btnSizeThreeQuarter.addEventListener('click', () => applyImageSize(0.75))
  btnSizeHalf.addEventListener('click', () => applyImageSize(0.5))
  btnSizeQuarter.addEventListener('click', () => applyImageSize(0.25))

  btnInpaintSizeFull.addEventListener('click', () => applyImageSize(1))
  btnInpaintSizeThreeQuarter.addEventListener('click', () => applyImageSize(0.75))
  btnInpaintSizeHalf.addEventListener('click', () => applyImageSize(0.5))
  btnInpaintSizeQuarter.addEventListener('click', () => applyImageSize(0.25))

  btnEditSizeFull.addEventListener('click', () => applyImageSize(1))
  btnEditSizeThreeQuarter.addEventListener('click', () => applyImageSize(0.75))
  btnEditSizeHalf.addEventListener('click', () => applyImageSize(0.5))
  btnEditSizeQuarter.addEventListener('click', () => applyImageSize(0.25))

  btnToggleImageInput.addEventListener('click', () => {
    btnToggleImageInput.classList.toggle('open')
    imageInputContent.classList.toggle('open')
  })

  btnSelectImage.addEventListener('click', async () => {
    const path = await invoke('pick_file')
    if (!path) return
    selectedImageForOp = path
    setSelectedImageState(path)
    const name = path.split(/[/\\]/).pop()
    imageName.textContent = name
    document.getElementById('btn-clear-image').classList.add('visible')
    updateImageOpUI()
    await refreshInpaintCanvas()
    onImageChange?.(path)
  })

  document.getElementById('btn-clear-image').addEventListener('click', () => {
    selectedImageForOp = null
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
    selectedImageForOp = filePath
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

function updateUpscaleButton() {
  const hasImage = !!getSelectedImageState()
  const btnRunUpscale = document.getElementById('btn-run-upscale')
  if (!btnRunUpscale) return
  const hasModel = !!document.querySelector('input[name="image-upscale-model"]:checked')
  btnRunUpscale.disabled = !(hasImage && hasModel)
}

export function updateImageOpUI() {
  const hasImage = !!getSelectedImageState()
  const btnSizeFull = document.getElementById('btn-size-full')
  const btnSizeThreeQuarter = document.getElementById('btn-size-three-quarter')
  const btnSizeHalf = document.getElementById('btn-size-half')
  const btnSizeQuarter = document.getElementById('btn-size-quarter')
  const btnInpaintSizeFull = document.getElementById('btn-inpaint-size-full')
  const btnInpaintSizeThreeQuarter = document.getElementById('btn-inpaint-size-three-quarter')
  const btnInpaintSizeHalf = document.getElementById('btn-inpaint-size-half')
  const btnInpaintSizeQuarter = document.getElementById('btn-inpaint-size-quarter')
  const btnEditSizeFull = document.getElementById('btn-edit-size-full')
  const btnEditSizeThreeQuarter = document.getElementById('btn-edit-size-three-quarter')
  const btnEditSizeHalf = document.getElementById('btn-edit-size-half')
  const btnEditSizeQuarter = document.getElementById('btn-edit-size-quarter')
  const btnOpenInpaint = document.getElementById('btn-open-inpaint')
  if (btnSizeFull) btnSizeFull.disabled = !hasImage
  if (btnSizeThreeQuarter) btnSizeThreeQuarter.disabled = !hasImage
  if (btnSizeHalf) btnSizeHalf.disabled = !hasImage
  if (btnSizeQuarter) btnSizeQuarter.disabled = !hasImage
  if (btnInpaintSizeFull) btnInpaintSizeFull.disabled = !hasImage
  if (btnInpaintSizeThreeQuarter) btnInpaintSizeThreeQuarter.disabled = !hasImage
  if (btnInpaintSizeHalf) btnInpaintSizeHalf.disabled = !hasImage
  if (btnInpaintSizeQuarter) btnInpaintSizeQuarter.disabled = !hasImage
  if (btnEditSizeFull) btnEditSizeFull.disabled = !hasImage
  if (btnEditSizeThreeQuarter) btnEditSizeThreeQuarter.disabled = !hasImage
  if (btnEditSizeHalf) btnEditSizeHalf.disabled = !hasImage
  if (btnEditSizeQuarter) btnEditSizeQuarter.disabled = !hasImage
  if (btnOpenInpaint) btnOpenInpaint.disabled = !hasImage
  updateUpscaleButton()
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

async function refreshInpaintCanvas() {
  const op = document.querySelector('input[name="image-op"]:checked')?.value
  const img = getSelectedImageState()
  if (op !== 'inpainting' || !img) return
  try {
    await loadInpaintImage(img)
    updateInpaintMaskStatus()
  } catch (e) {
    console.error('Error cargando imagen para inpainting:', e)
  }
}

function clearInpaintState() {
  resetInpaint()
  const el = document.getElementById('inpaint-mask-status')
  if (el) el.textContent = 'Sin máscara'
}

function updateInpaintMaskStatus() {
  const el = document.getElementById('inpaint-mask-status')
  if (el) el.textContent = isMaskPainted() ? 'Máscara pintada' : 'Sin máscara'
}

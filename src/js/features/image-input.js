import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { createIcons, icons } from 'lucide'
import { getUpscannersPath } from '../config.js'
import {
  MAX_REFERENCE_IMAGES,
  getSelectedImages,
  getSelectedImageState,
  addSelectedImages,
  removeSelectedImage,
  moveSelectedImage,
  clearSelectedImages,
  onSelectedImagesChange,
} from '../state/image-state.js'
import { updateImageOpUI, refreshInpaintCanvas, clearInpaintState } from './image-op.js'

const VALID_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp']

let pointerDrag = null
let scrollRaf = null
let pendingFocusIndex = null

export function getSelectedImageForOp() {
  return getSelectedImageState()
}

function fileName(path) {
  return path.split(/[/\\]/).pop()
}

function isImagePath(path) {
  return VALID_IMAGE_EXTS.some(ext => path.toLowerCase().endsWith(ext))
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

function dropHint(count) {
  if (count === 0) return 'o arrastra las imágenes aquí'
  if (count >= MAX_REFERENCE_IMAGES) return `máximo de ${MAX_REFERENCE_IMAGES} imágenes`
  return 'o arrastra más imágenes aquí'
}

function syncImageInputUI() {
  const images = getSelectedImages()
  const count = images.length

  document.getElementById('image-input-count').textContent =
    `${count} / ${MAX_REFERENCE_IMAGES}`
  document.getElementById('image-input-name').textContent = dropHint(count)
  document.getElementById('btn-select-image').disabled = count >= MAX_REFERENCE_IMAGES
  document.getElementById('btn-clear-image').classList.toggle('visible', count > 0)
  document.getElementById('image-input-hint').hidden = count === 0
  for (const el of document.querySelectorAll('.size-label-note')) {
    el.hidden = count <= 1
  }
}

function renderImageList() {
  const list = document.getElementById('image-input-list')
  const images = getSelectedImages()
  list.innerHTML = ''

  images.forEach((path, index) => {
    const item = document.createElement('li')
    item.className = 'image-input-item'
    item.tabIndex = 0
    item.dataset.index = String(index)
    item.setAttribute(
      'aria-label',
      `Imagen ${index + 1}: ${fileName(path)}. Usa Alt y las flechas para reordenar.`
    )

    const handle = document.createElement('i')
    handle.className = 'image-input-grip'
    handle.dataset.lucide = 'grip-vertical'
    handle.setAttribute('aria-hidden', 'true')

    const order = document.createElement('span')
    order.className = 'image-input-order'
    order.textContent = `#${index + 1}`

    const thumb = document.createElement('img')
    thumb.className = 'image-input-thumb'
    thumb.src = convertFileSrc(path)
    thumb.alt = ''
    thumb.loading = 'lazy'
    thumb.draggable = false

    const name = document.createElement('span')
    name.className = 'image-input-name'
    name.textContent = fileName(path)
    name.title = path

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'btn-icon btn-danger image-input-remove'
    remove.title = 'Quitar imagen'
    remove.setAttribute('aria-label', `Quitar imagen ${index + 1}`)
    remove.innerHTML = '<i data-lucide="x"></i>'
    remove.addEventListener('click', () => removeSelectedImage(index))

    item.append(handle, order, thumb, name, remove)
    list.append(item)
  })

  createIcons({ icons })

  if (pendingFocusIndex !== null) {
    list
      .querySelector(`.image-input-item[data-index="${pendingFocusIndex}"]`)
      ?.focus()
    pendingFocusIndex = null
  }
}

const ITEM_SELECTOR = '.image-input-item'
const DRAG_THRESHOLD = 4
const AUTOSCROLL_EDGE = 36

function findScrollParent(el) {
  let node = el.parentElement
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function bindListReorder(list) {
  function clearDragState() {
    list.classList.remove('is-reordering')
    for (const el of list.querySelectorAll('.dragging')) {
      el.classList.remove('dragging')
    }
    if (scrollRaf !== null) {
      cancelAnimationFrame(scrollRaf)
      scrollRaf = null
    }
  }

  function markDraggedItem() {
    for (const el of list.querySelectorAll('.dragging')) {
      el.classList.remove('dragging')
    }
    list
      .querySelector(`${ITEM_SELECTOR}[data-index="${pointerDrag.from}"]`)
      ?.classList.add('dragging')
  }

  // Live reorder: move the item as soon as the pointer crosses another item's midpoint.
  function reorderAt(clientY) {
    if (!pointerDrag) return
    const items = [...list.querySelectorAll(ITEM_SELECTOR)]
    let insertAt = items.length
    for (const el of items) {
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        insertAt = Number(el.dataset.index)
        break
      }
    }
    const from = pointerDrag.from
    if (insertAt === from || insertAt === from + 1) return
    pointerDrag.from = insertAt > from ? insertAt - 1 : insertAt
    moveSelectedImage(from, insertAt)
    markDraggedItem()
  }

  // Pointer capture keeps events flowing, but the list itself does not scroll on its own.
  function autoScrollStep() {
    scrollRaf = null
    if (!pointerDrag?.active) return
    const scroller = pointerDrag.scroller
    if (scroller) {
      const rect = scroller.getBoundingClientRect()
      const y = pointerDrag.y
      let delta = 0
      if (y < rect.top + AUTOSCROLL_EDGE) {
        delta = -Math.ceil((rect.top + AUTOSCROLL_EDGE - y) / 4)
      } else if (y > rect.bottom - AUTOSCROLL_EDGE) {
        delta = Math.ceil((y - (rect.bottom - AUTOSCROLL_EDGE)) / 4)
      }
      if (delta !== 0) {
        scroller.scrollTop += delta
        reorderAt(y)
      }
    }
    scrollRaf = requestAnimationFrame(autoScrollStep)
  }

  list.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    if (event.target.closest('button')) return
    const item = event.target.closest(ITEM_SELECTOR)
    if (!item) return
    // Prevents text selection and the browser's native image drag.
    event.preventDefault()
    item.focus()
    pointerDrag = {
      pointerId: event.pointerId,
      from: Number(item.dataset.index),
      x: event.clientX,
      y: event.clientY,
      active: false,
    }
    list.setPointerCapture(event.pointerId)
  })

  list.addEventListener('pointermove', (event) => {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
    pointerDrag.y = event.clientY
    if (!pointerDrag.active) {
      if (Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) < DRAG_THRESHOLD) return
      pointerDrag.active = true
      pointerDrag.scroller = findScrollParent(list)
      list.classList.add('is-reordering')
      markDraggedItem()
      if (scrollRaf === null && pointerDrag.scroller) {
        scrollRaf = requestAnimationFrame(autoScrollStep)
      }
    }
    reorderAt(event.clientY)
  })

  function finishDrag(event) {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
    const wasActive = pointerDrag.active
    const finalIndex = pointerDrag.from
    pointerDrag = null
    clearDragState()
    if (list.hasPointerCapture(event.pointerId)) {
      list.releasePointerCapture(event.pointerId)
    }
    if (wasActive) {
      list.querySelector(`${ITEM_SELECTOR}[data-index="${finalIndex}"]`)?.focus()
    }
  }

  list.addEventListener('pointerup', finishDrag)
  list.addEventListener('pointercancel', finishDrag)

  list.addEventListener('keydown', (event) => {
    if (!event.altKey) return
    const item = event.target.closest(ITEM_SELECTOR)
    if (!item) return
    const index = Number(item.dataset.index)
    const count = getSelectedImages().length
    const up = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
    const down = event.key === 'ArrowDown' || event.key === 'ArrowRight'
    if (!up && !down) return
    if (up && index === 0) return
    if (down && index === count - 1) return
    event.preventDefault()
    if (up) {
      pendingFocusIndex = index - 1
      moveSelectedImage(index, index - 1)
    } else {
      pendingFocusIndex = index + 1
      moveSelectedImage(index, index + 2)
    }
  })
}

export function initImageInput() {
  const btnToggleImageInput = document.getElementById('btn-toggle-image-input')
  const imageInputContent = document.getElementById('image-input-content')
  const btnSelectImage = document.getElementById('btn-select-image')
  const list = document.getElementById('image-input-list')
  const dropZone = document.getElementById('image-drop-zone')

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

  onSelectedImagesChange(() => {
    syncImageInputUI()
    renderImageList()
    updateImageOpUI()
    refreshInpaintCanvas()
  })

  bindListReorder(list)

  btnSelectImage.addEventListener('click', async () => {
    const paths = await invoke('pick_images')
    if (!paths?.length) return
    addSelectedImages(paths)
  })

  document.getElementById('btn-clear-image').addEventListener('click', () => {
    clearSelectedImages()
    clearInpaintState()
  })

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
    const paths = (event.payload?.paths ?? []).filter(isImagePath)
    if (!paths.length) return
    addSelectedImages(paths)
  })

  syncImageInputUI()
  renderImageList()
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

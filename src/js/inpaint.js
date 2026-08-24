import { invoke, convertFileSrc } from '@tauri-apps/api/core'

let baseCanvas = null
let overlayCanvas = null
let maskCanvas = null
let ctxBase = null
let ctxOverlay = null
let ctxMask = null

let naturalWidth = 0
let naturalHeight = 0
let preparedPath = null
let painted = false
let drawing = false
let lastPoint = null
let eventsBound = false
let resizeObserver = null

function fitCanvases() {
  if (!baseCanvas || !naturalWidth) return
  const wrap = document.getElementById('inpaint-canvas-wrap')
  if (!wrap) return
  const availW = wrap.clientWidth
  const availH = wrap.clientHeight
  const scale = Math.min(availW / naturalWidth, availH / naturalHeight, 1)
  const w = Math.max(1, Math.floor(naturalWidth * scale))
  const h = Math.max(1, Math.floor(naturalHeight * scale))
  baseCanvas.style.width = `${w}px`
  baseCanvas.style.height = `${h}px`
  overlayCanvas.style.width = `${w}px`
  overlayCanvas.style.height = `${h}px`
}

function initElements() {
  if (baseCanvas) return
  baseCanvas = document.getElementById('inpaint-canvas-base')
  overlayCanvas = document.getElementById('inpaint-canvas-overlay')
  ctxBase = baseCanvas.getContext('2d')
  ctxOverlay = overlayCanvas.getContext('2d')

  const wrap = document.getElementById('inpaint-canvas-wrap')
  if (wrap && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(fitCanvases)
    resizeObserver.observe(wrap)
  }
}

function initMaskCanvas() {
  if (!maskCanvas) {
    maskCanvas = document.createElement('canvas')
    ctxMask = maskCanvas.getContext('2d')
  }
  maskCanvas.width = naturalWidth
  maskCanvas.height = naturalHeight
  ctxMask.fillStyle = '#000000'
  ctxMask.fillRect(0, 0, naturalWidth, naturalHeight)
}

function brushRadiusNatural() {
  const rect = overlayCanvas.getBoundingClientRect()
  const displayScale = rect.width > 0 ? naturalWidth / rect.width : 1
  const size = parseInt(document.getElementById('input-brush-size')?.value ?? '24', 10)
  return Math.max(2, (size / 2) * displayScale)
}

function eventPoint(e) {
  const rect = overlayCanvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (naturalWidth / rect.width),
    y: (e.clientY - rect.top) * (naturalHeight / rect.height)
  }
}

function drawStroke(from, to) {
  const radius = brushRadiusNatural()

  ctxOverlay.strokeStyle = 'rgba(255, 64, 64, 0.45)'
  ctxOverlay.lineWidth = radius * 2

  ctxMask.strokeStyle = '#ffffff'
  ctxMask.lineWidth = radius * 2

  for (const ctx of [ctxOverlay, ctxMask]) {
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }
}

export async function loadInpaintImage(path) {
  initElements()
  clearMask()
  preparedPath = null

  try {
    preparedPath = await invoke('prepare_inpaint_image', { path })
  } catch (e) {
    preparedPath = path
  }

  await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      naturalWidth = img.naturalWidth
      naturalHeight = img.naturalHeight

      baseCanvas.width = naturalWidth
      baseCanvas.height = naturalHeight
      overlayCanvas.width = naturalWidth
      overlayCanvas.height = naturalHeight

      ctxBase.drawImage(img, 0, 0)
      initMaskCanvas()
      fitCanvases()
      resolve()
    }
    img.onerror = () => reject(new Error('No se pudo cargar la imagen para inpainting'))
    img.src = convertFileSrc(preparedPath)
  })
}

export function clearMask() {
  painted = false
  lastPoint = null
  drawing = false
  if (ctxOverlay && naturalWidth > 0) {
    ctxOverlay.clearRect(0, 0, naturalWidth, naturalHeight)
  }
  if (ctxMask && maskCanvas) {
    ctxMask.fillStyle = '#000000'
    ctxMask.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
  }
}

export function resetInpaint() {
  clearMask()
  preparedPath = null
  naturalWidth = 0
  naturalHeight = 0
  if (baseCanvas) {
    baseCanvas.width = 0
    baseCanvas.height = 0
    overlayCanvas.width = 0
    overlayCanvas.height = 0
  }
}

export function isMaskPainted() {
  return painted && naturalWidth > 0
}

export function getPreparedImagePath() {
  return preparedPath
}

export function exportMask() {
  return maskCanvas ? maskCanvas.toDataURL('image/png') : null
}

export function initInpaintEvents() {
  if (eventsBound) return
  eventsBound = true

  initElements()

  overlayCanvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    overlayCanvas.setPointerCapture(e.pointerId)
    drawing = true
    lastPoint = eventPoint(e)
    drawStroke(lastPoint, { x: lastPoint.x + 0.01, y: lastPoint.y + 0.01 })
    painted = true
  })

  overlayCanvas.addEventListener('pointermove', (e) => {
    if (!drawing) return
    const point = eventPoint(e)
    drawStroke(lastPoint, point)
    lastPoint = point
  })

  const stopDrawing = () => {
    drawing = false
    lastPoint = null
  }

  overlayCanvas.addEventListener('pointerup', stopDrawing)
  overlayCanvas.addEventListener('pointercancel', stopDrawing)

  document.getElementById('btn-clear-mask').addEventListener('click', clearMask)
}

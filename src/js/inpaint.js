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
let drawing = false
let lastPoint = null
let eventsBound = false
let resizeObserver = null
let brushMode = 'paint'
let strokes = []
let currentStroke = null
let preparedFrom = null
let loadToken = 0

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

function brushSize() {
  return parseInt(document.getElementById('input-brush-size')?.value ?? '24', 10)
}

function eventPoint(e) {
  const rect = overlayCanvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (naturalWidth / rect.width),
    y: (e.clientY - rect.top) * (naturalHeight / rect.height)
  }
}

function drawSegment(from, to, size, mode) {
  const width = Math.max(2, size)

  ctxOverlay.save()
  if (mode === 'erase') {
    ctxOverlay.globalCompositeOperation = 'destination-out'
  }
  ctxOverlay.strokeStyle = 'rgba(255, 64, 64, 0.45)'
  ctxOverlay.lineWidth = width
  ctxOverlay.lineCap = 'round'
  ctxOverlay.lineJoin = 'round'
  ctxOverlay.beginPath()
  ctxOverlay.moveTo(from.x, from.y)
  ctxOverlay.lineTo(to.x, to.y)
  ctxOverlay.stroke()
  ctxOverlay.restore()

  ctxMask.strokeStyle = mode === 'erase' ? '#000000' : '#ffffff'
  ctxMask.lineWidth = width
  ctxMask.lineCap = 'round'
  ctxMask.lineJoin = 'round'
  ctxMask.beginPath()
  ctxMask.moveTo(from.x, from.y)
  ctxMask.lineTo(to.x, to.y)
  ctxMask.stroke()
}

function replayStrokes() {
  if (!ctxOverlay || !ctxMask) return
  ctxOverlay.clearRect(0, 0, naturalWidth, naturalHeight)
  ctxMask.fillStyle = '#000000'
  ctxMask.fillRect(0, 0, naturalWidth, naturalHeight)
  for (const stroke of strokes) {
    const pts = stroke.points
    if (pts.length === 1) {
      drawSegment(pts[0], { x: pts[0].x + 0.01, y: pts[0].y + 0.01 }, stroke.size, stroke.mode)
      continue
    }
    for (let i = 1; i < pts.length; i++) {
      drawSegment(pts[i - 1], pts[i], stroke.size, stroke.mode)
    }
  }
}

function updateToolbarState() {
  const hasStrokes = strokes.length > 0
  document.getElementById('btn-undo-mask').disabled = !hasStrokes
  document.getElementById('btn-clear-mask').disabled = !hasStrokes
}

function setLoading(loading) {
  document.getElementById('inpaint-loading')?.classList.toggle('visible', loading)
}

let modeIndicator = null

function positionModeIndicator() {
  const active = document.querySelector('.inpaint-mode-toggle button.active')
  if (!active || !modeIndicator) return
  modeIndicator.style.left = `${active.offsetLeft}px`
  modeIndicator.style.width = `${active.offsetWidth}px`
}

export function setBrushMode(mode) {
  brushMode = mode
  document.getElementById('btn-mode-paint').classList.toggle('active', mode === 'paint')
  document.getElementById('btn-mode-erase').classList.toggle('active', mode === 'erase')
  positionModeIndicator()
}

export async function loadInpaintImage(path) {
  initElements()

  if (preparedFrom === path && preparedPath) {
    return
  }

  const token = ++loadToken
  clearMask()
  preparedPath = null
  preparedFrom = null
  setLoading(true)

  let resolvedPath
  try {
    resolvedPath = await invoke('prepare_inpaint_image', { path })
  } catch (e) {
    resolvedPath = path
  }
  if (token !== loadToken) return
  preparedPath = resolvedPath
  preparedFrom = path

  await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      if (token !== loadToken) {
        resolve()
        return
      }
      setLoading(false)
      naturalWidth = img.naturalWidth
      naturalHeight = img.naturalHeight

      baseCanvas.width = naturalWidth
      baseCanvas.height = naturalHeight
      overlayCanvas.width = naturalWidth
      overlayCanvas.height = naturalHeight

      ctxBase.drawImage(img, 0, 0)
      initMaskCanvas()
      fitCanvases()
      updateToolbarState()
      resolve()
    }
    img.onerror = () => {
      if (token !== loadToken) {
        resolve()
        return
      }
      setLoading(false)
      reject(new Error('No se pudo cargar la imagen para inpainting'))
    }
    img.src = convertFileSrc(preparedPath)
  })
}

export function clearMask() {
  strokes = []
  currentStroke = null
  lastPoint = null
  drawing = false
  replayStrokes()
  updateToolbarState()
}

export function undoStroke() {
  if (strokes.length === 0) return
  strokes.pop()
  replayStrokes()
  updateToolbarState()
}

export function resetInpaint() {
  clearMask()
  preparedPath = null
  preparedFrom = null
  naturalWidth = 0
  naturalHeight = 0
  setLoading(false)
  if (baseCanvas) {
    baseCanvas.width = 0
    baseCanvas.height = 0
    overlayCanvas.width = 0
    overlayCanvas.height = 0
  }
}

export function isMaskPainted() {
  return strokes.length > 0 && naturalWidth > 0
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
    const point = eventPoint(e)
    currentStroke = { mode: brushMode, size: brushSize(), points: [point] }
    lastPoint = point
    drawSegment(point, { x: point.x + 0.01, y: point.y + 0.01 }, currentStroke.size, brushMode)
  })

  overlayCanvas.addEventListener('pointermove', (e) => {
    if (!drawing) return
    const point = eventPoint(e)
    currentStroke.points.push(point)
    drawSegment(lastPoint, point, currentStroke.size, currentStroke.mode)
    lastPoint = point
  })

  const stopDrawing = () => {
    if (currentStroke) {
      strokes.push(currentStroke)
      currentStroke = null
      updateToolbarState()
    }
    drawing = false
    lastPoint = null
  }

  overlayCanvas.addEventListener('pointerup', stopDrawing)
  overlayCanvas.addEventListener('pointercancel', stopDrawing)

  document.getElementById('btn-clear-mask').addEventListener('click', clearMask)
  document.getElementById('btn-undo-mask').addEventListener('click', undoStroke)

  document.getElementById('btn-mode-paint').addEventListener('click', () => setBrushMode('paint'))
  document.getElementById('btn-mode-erase').addEventListener('click', () => setBrushMode('erase'))

  const modeToggle = document.querySelector('.inpaint-mode-toggle')
  modeIndicator = document.createElement('span')
  modeIndicator.className = 'inpaint-mode-indicator'
  modeToggle.prepend(modeIndicator)
  positionModeIndicator()
  if ('ResizeObserver' in window) {
    new ResizeObserver(positionModeIndicator).observe(modeToggle)
  }

  document.getElementById('input-brush-size').addEventListener('input', (e) => {
    document.getElementById('brush-size-value').textContent = e.target.value
  })
}

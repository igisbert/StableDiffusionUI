import { invoke, convertFileSrc } from '@tauri-apps/api/core'

const OVERLAY_ALPHA = 0.5

let baseCanvas = null
let overlayCanvas = null
let maskCanvas = null
let ctxBase = null
let ctxOverlay = null
let ctxMask = null
let strokeCanvas = null
let ctxStroke = null
let tmpCanvas = null
let ctxTmp = null
let naturalWidth = 0
let naturalHeight = 0
let preparedPath = null
let drawing = false
let lastPoint = null
let eventsBound = false
let resizeObserver = null
let brushMode = 'paint'
let tool = 'brush'
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
  ctxMask.clearRect(0, 0, naturalWidth, naturalHeight)
}

function ensureStrokeCanvas() {
  if (!strokeCanvas) {
    strokeCanvas = document.createElement('canvas')
    ctxStroke = strokeCanvas.getContext('2d')
  }
  strokeCanvas.width = naturalWidth
  strokeCanvas.height = naturalHeight
}

function ensureTmpCanvas() {
  if (!tmpCanvas) {
    tmpCanvas = document.createElement('canvas')
    ctxTmp = tmpCanvas.getContext('2d')
  }
  tmpCanvas.width = naturalWidth
  tmpCanvas.height = naturalHeight
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

function drawMaskSegment(from, to, size, mode) {
  ctxMask.save()
  if (mode === 'erase') {
    ctxMask.globalCompositeOperation = 'destination-out'
  }
  ctxMask.strokeStyle = '#ffffff'
  ctxMask.lineWidth = Math.max(2, size)
  ctxMask.lineCap = 'round'
  ctxMask.lineJoin = 'round'
  ctxMask.beginPath()
  ctxMask.moveTo(from.x, from.y)
  ctxMask.lineTo(to.x, to.y)
  ctxMask.stroke()
  ctxMask.restore()
}

function drawStrokeSegment(from, to, size) {
  ctxStroke.save()
  ctxStroke.strokeStyle = '#ffffff'
  ctxStroke.lineWidth = Math.max(2, size)
  ctxStroke.lineCap = 'round'
  ctxStroke.lineJoin = 'round'
  ctxStroke.beginPath()
  ctxStroke.moveTo(from.x, from.y)
  ctxStroke.lineTo(to.x, to.y)
  ctxStroke.stroke()
  ctxStroke.restore()
}

function pathShape(ctx, type, from, to) {
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  const w = Math.abs(to.x - from.x)
  const h = Math.abs(to.y - from.y)
  ctx.beginPath()
  if (type === 'rect') {
    ctx.rect(x, y, w, h)
  } else {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  }
}

function drawStrokeShape(stroke) {
  ctxStroke.save()
  ctxStroke.fillStyle = '#ffffff'
  pathShape(ctxStroke, stroke.type, stroke.from, stroke.to)
  ctxStroke.fill()
  ctxStroke.restore()
}

function drawMaskShape(stroke) {
  ctxMask.save()
  if (stroke.mode === 'erase') {
    ctxMask.globalCompositeOperation = 'destination-out'
  }
  ctxMask.fillStyle = '#ffffff'
  pathShape(ctxMask, stroke.type, stroke.from, stroke.to)
  ctxMask.fill()
  ctxMask.restore()
}

function compositeOverlay(mode) {
  ensureTmpCanvas()

  ctxTmp.clearRect(0, 0, naturalWidth, naturalHeight)
  ctxTmp.drawImage(maskCanvas, 0, 0)
  if (mode === 'erase') {
    ctxTmp.globalCompositeOperation = 'destination-out'
    ctxTmp.drawImage(strokeCanvas, 0, 0)
    ctxTmp.globalCompositeOperation = 'source-over'
  } else {
    ctxTmp.drawImage(strokeCanvas, 0, 0)
  }

  ctxOverlay.save()
  ctxOverlay.globalCompositeOperation = 'source-over'
  ctxOverlay.globalAlpha = 1
  ctxOverlay.clearRect(0, 0, naturalWidth, naturalHeight)
  ctxOverlay.globalAlpha = OVERLAY_ALPHA
  ctxOverlay.drawImage(tmpCanvas, 0, 0)
  ctxOverlay.globalAlpha = 1
  ctxOverlay.globalCompositeOperation = 'source-in'
  ctxOverlay.fillStyle = '#ff4040'
  ctxOverlay.fillRect(0, 0, naturalWidth, naturalHeight)
  ctxOverlay.restore()
}

function replayStrokes() {
  if (!ctxOverlay || !ctxMask) return
  ctxOverlay.clearRect(0, 0, naturalWidth, naturalHeight)
  ctxMask.clearRect(0, 0, naturalWidth, naturalHeight)
  for (const stroke of strokes) {
    if (stroke.type === 'rect' || stroke.type === 'ellipse') {
      drawMaskShape(stroke)
    } else {
      const pts = stroke.points
      if (pts.length === 1) {
        drawMaskSegment(pts[0], { x: pts[0].x + 0.01, y: pts[0].y + 0.01 }, stroke.size, stroke.mode)
        continue
      }
      for (let i = 1; i < pts.length; i++) {
        drawMaskSegment(pts[i - 1], pts[i], stroke.size, stroke.mode)
      }
    }
  }
  ensureStrokeCanvas()
  compositeOverlay('paint')
}

function updateToolbarState() {
  const hasStrokes = strokes.length > 0
  document.getElementById('btn-undo-mask').disabled = !hasStrokes
  document.getElementById('btn-clear-mask').disabled = !hasStrokes
}

function setLoading(loading) {
  document.getElementById('inpaint-loading')?.classList.toggle('visible', loading)
}

function setupSegmented(container, onSelect) {
  const indicator = document.createElement('span')
  indicator.className = 'inpaint-mode-indicator'
  container.prepend(indicator)
  const position = () => {
    const active = container.querySelector('button.active')
    if (!active) return
    indicator.style.left = `${active.offsetLeft}px`
    indicator.style.width = `${active.offsetWidth}px`
  }
  container.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn))
      position()
      onSelect(btn)
    })
  })
  position()
  if ('ResizeObserver' in window) {
    new ResizeObserver(position).observe(container)
  }
  return position
}

export function setBrushMode(mode) {
  brushMode = mode
}

export function setTool(selectedTool) {
  tool = selectedTool
  ;['brush', 'rect', 'ellipse'].forEach((name) => {
    document.getElementById(`btn-tool-${name}`).classList.toggle('active', name === tool)
  })
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
  if (!maskCanvas) return null
  const out = document.createElement('canvas')
  out.width = maskCanvas.width
  out.height = maskCanvas.height
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(maskCanvas, 0, 0)
  return out.toDataURL('image/png')
}

export function initInpaintEvents() {
  if (eventsBound) return
  eventsBound = true

  initElements()

  overlayCanvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    overlayCanvas.setPointerCapture(e.pointerId)
    const point = eventPoint(e)

    drawing = true
    ensureStrokeCanvas()
    if (tool === 'brush') {
      currentStroke = { type: 'brush', mode: brushMode, size: brushSize(), points: [point] }
      lastPoint = point
      drawMaskSegment(point, { x: point.x + 0.01, y: point.y + 0.01 }, currentStroke.size, brushMode)
      drawStrokeSegment(point, { x: point.x + 0.01, y: point.y + 0.01 }, currentStroke.size)
    } else {
      currentStroke = { type: tool, mode: brushMode, from: point, to: point }
      drawStrokeShape(currentStroke)
    }
    compositeOverlay(brushMode)
  })

  overlayCanvas.addEventListener('pointermove', (e) => {
    if (!drawing || !currentStroke) return
    const point = eventPoint(e)
    if (currentStroke.type === 'brush') {
      currentStroke.points.push(point)
      drawMaskSegment(lastPoint, point, currentStroke.size, currentStroke.mode)
      drawStrokeSegment(lastPoint, point, currentStroke.size)
      lastPoint = point
    } else {
      currentStroke.to = point
      ensureStrokeCanvas()
      drawStrokeShape(currentStroke)
    }
    compositeOverlay(currentStroke.mode)
  })

  const stopDrawing = () => {
    if (currentStroke) {
      strokes.push(currentStroke)
      if (currentStroke.type !== 'brush') {
        drawMaskShape(currentStroke)
      }
      ensureStrokeCanvas()
      compositeOverlay(currentStroke.mode)
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

  document.querySelectorAll('#inpaint-tool-select button').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.id.replace('btn-tool-', '')))
  })

  setupSegmented(document.getElementById('inpaint-mode-toggle'), (btn) => {
    setBrushMode(btn.id === 'btn-mode-paint' ? 'paint' : 'erase')
  })

  document.getElementById('input-brush-size').addEventListener('input', (e) => {
    document.getElementById('brush-size-value').textContent = e.target.value
  })
}

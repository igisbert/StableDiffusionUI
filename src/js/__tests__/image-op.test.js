import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initImageOp, refreshInpaintCanvas, updateImageOpUI } from '../features/image-op.js'
import { setSelectedImages, __resetImageState } from '../state/image-state.js'
import * as inpaint from '../inpaint.js'

vi.mock('../inpaint.js', () => ({
  loadInpaintImage: vi.fn(() => Promise.resolve()),
  resetInpaint: vi.fn(),
  isMaskPainted: vi.fn(() => false),
}))

function setupDom() {
  document.body.innerHTML = `
    <input type="radio" name="image-op" value="img2img" />
    <input type="radio" name="image-op" value="inpainting" />
    <input type="radio" name="image-op" value="image-edit" />
    <input type="radio" name="image-op" value="upscale" />
    <input type="radio" name="image-op" value="cancel" />
    <button class="size-btn"></button>
    <button id="btn-open-inpaint"></button>
    <button id="btn-run-upscale"></button>
    <p id="image-input-warning" hidden></p>
    <span id="inpaint-mask-status"></span>
    <span id="cancel-op-label"></span>
    <div id="image-op-options"></div>
    <div id="upscale-options"></div>
    <div id="img2img-options"></div>
    <div id="inpainting-options"></div>
    <div id="image-edit-options"></div>
  `
}

function selectOp(value) {
  document.querySelector(`input[name="image-op"][value="${value}"]`).checked = true
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetImageState()
  setupDom()
})

describe('refreshInpaintCanvas', () => {
  it('clears inpainting state when there is no image', async () => {
    selectOp('inpainting')
    await refreshInpaintCanvas()
    expect(inpaint.resetInpaint).toHaveBeenCalled()
    expect(inpaint.loadInpaintImage).not.toHaveBeenCalled()
  })

  it('clears inpainting state when another operation is selected', async () => {
    setSelectedImages(['C:\\foto.png'])
    selectOp('img2img')
    await refreshInpaintCanvas()
    expect(inpaint.resetInpaint).toHaveBeenCalled()
    expect(inpaint.loadInpaintImage).not.toHaveBeenCalled()
  })

  it('loads the first image when inpainting is selected', async () => {
    setSelectedImages(['C:\\foto.png', 'C:\\extra.png'])
    selectOp('inpainting')
    await refreshInpaintCanvas()
    expect(inpaint.loadInpaintImage).toHaveBeenCalledWith('C:\\foto.png')
    expect(inpaint.resetInpaint).not.toHaveBeenCalled()
  })
})

describe('updateImageOpUI warning', () => {
  const warning = () => document.getElementById('image-input-warning')

  it('stays hidden without an operation selected', () => {
    setSelectedImages(['C:\\a.png', 'C:\\b.png'])
    updateImageOpUI()
    expect(warning().hidden).toBe(true)
  })

  it('stays hidden with a single image', () => {
    setSelectedImages(['C:\\a.png'])
    selectOp('img2img')
    updateImageOpUI()
    expect(warning().hidden).toBe(true)
  })

  it('shows for img2img with several images', () => {
    setSelectedImages(['C:\\a.png', 'C:\\b.png'])
    selectOp('img2img')
    updateImageOpUI()
    expect(warning().hidden).toBe(false)
  })

  it('shows for inpainting and upscale with several images', () => {
    setSelectedImages(['C:\\a.png', 'C:\\b.png'])
    selectOp('inpainting')
    updateImageOpUI()
    expect(warning().hidden).toBe(false)

    selectOp('upscale')
    updateImageOpUI()
    expect(warning().hidden).toBe(false)
  })

  it('stays hidden for image-edit with several images', () => {
    setSelectedImages(['C:\\a.png', 'C:\\b.png'])
    selectOp('image-edit')
    updateImageOpUI()
    expect(warning().hidden).toBe(true)
  })

  it('hides again when the operation is cancelled', () => {
    initImageOp()
    setSelectedImages(['C:\\a.png', 'C:\\b.png'])

    const img2img = document.querySelector('input[name="image-op"][value="img2img"]')
    img2img.checked = true
    img2img.dispatchEvent(new Event('change'))
    expect(warning().hidden).toBe(false)

    const cancel = document.querySelector('input[name="image-op"][value="cancel"]')
    cancel.checked = true
    cancel.dispatchEvent(new Event('change'))
    expect(warning().hidden).toBe(true)
  })
})

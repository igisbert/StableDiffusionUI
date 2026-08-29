import { loadInpaintImage, resetInpaint, isMaskPainted } from '../inpaint.js'
import { getSelectedImageState } from '../state/image-state.js'
import { updateImageOpUI } from './image-input.js'

export function initImageOp() {
  const cancelOpLabel = document.getElementById('cancel-op-label')
  const upscaleOptions = document.getElementById('upscale-options')
  const img2imgOptions = document.getElementById('img2img-options')
  const inpaintingOptions = document.getElementById('inpainting-options')
  const editOptions = document.getElementById('image-edit-options')

  const PANELS = {
    upscale: upscaleOptions,
    img2img: img2imgOptions,
    inpainting: inpaintingOptions,
    'image-edit': editOptions,
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

  document.querySelectorAll('input[name="image-op"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const options = document.getElementById('image-op-options')
      const value = radio.value

      if (value === 'cancel') {
        radio.checked = false
        cancelOpLabel.style.display = 'none'
        options.classList.remove('visible')
        for (const el of Object.values(PANELS)) el.style.display = 'none'
        return
      }

      cancelOpLabel.style.display = 'inline-flex'
      options.classList.add('visible')

      for (const [key, el] of Object.entries(PANELS)) {
        el.style.display = key === value ? 'flex' : 'none'
      }

      refreshInpaintCanvas()
      updateImageOpUI()
    })
  })

  // expose for image-input to call on image change
  return { refreshInpaintCanvas, clearInpaintState, updateInpaintMaskStatus }
}

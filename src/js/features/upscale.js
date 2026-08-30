import { invoke } from '@tauri-apps/api/core'
import { getOutputPath, getSdPath, getUpscannersPath } from '../config.js'
import { getSelectedImageState } from '../state/image-state.js'
import { startProcess, endProcess, isBusy } from '../busy.js'
import { getSelectedImage } from '../preview.js'
import { updateImageOpUI } from './image-op.js'

async function runUpscale({ model, inputImage }) {
  if (isBusy()) return false
  if (!model || !inputImage) return false
  const sdPath = await getSdPath()
  const outputPath = await getOutputPath()
  const upscalersPath = await getUpscannersPath()
  if (!sdPath || !outputPath || !upscalersPath) return false
  startProcess()
  try {
    await invoke('run_upscale', {
      sdPath,
      outputPath,
      upscalersPath,
      model,
      inputImage,
    })
    return true
  } catch (e) {
    console.error('Upscale error:', e)
    return false
  } finally {
    endProcess()
  }
}

export function initUpscale() {
  const btnRun = document.getElementById('btn-run')

  document.getElementById('btn-upscale').addEventListener('click', () => {
    document.getElementById('popover-upscale').classList.toggle('open')
  })

  document.getElementById('btn-close-upscale').addEventListener('click', () => {
    document.getElementById('popover-upscale').classList.remove('open')
  })

  document.getElementById('btn-run-upscale-popover').addEventListener('click', async () => {
    const selectedRadio = document.querySelector('input[name="upscale-model"]:checked')
    const inputImage = getSelectedImage()
    if (!selectedRadio || !inputImage) return
    document.getElementById('popover-upscale').classList.remove('open')
    btnRun.disabled = true
    try {
      await runUpscale({ model: selectedRadio.value, inputImage })
    } finally {
      btnRun.disabled = false
    }
  })

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('popover-upscale')
    const btn = document.getElementById('btn-upscale')
    if (!pop.contains(e.target) && !btn.contains(e.target)) {
      pop.classList.remove('open')
    }
  })

  function setUpscaling(running) {
    const btnRunUpscale = document.getElementById('btn-run-upscale')
    const btnAbortUpscale = document.getElementById('btn-abort-upscale')
    if (running) {
      btnRun.disabled = true
      if (btnRunUpscale) btnRunUpscale.disabled = true
      if (btnAbortUpscale) btnAbortUpscale.hidden = false
    } else {
      if (btnAbortUpscale) btnAbortUpscale.hidden = true
      btnRun.disabled = false
      updateImageOpUI()
    }
  }

  document.getElementById('btn-abort-upscale').addEventListener('click', async () => {
    try {
      await invoke('abort_inference')
    } catch (e) {}
  })

  document.getElementById('btn-run-upscale').addEventListener('click', async () => {
    const img = getSelectedImageState()
    const selectedModel = document.querySelector('input[name="image-upscale-model"]:checked')
    if (!img || !selectedModel) return
    if (isBusy()) return
    setUpscaling(true)
    try {
      await runUpscale({ model: selectedModel.value, inputImage: img })
    } finally {
      setUpscaling(false)
    }
  })
}

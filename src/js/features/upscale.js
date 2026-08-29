import { invoke } from '@tauri-apps/api/core'
import { getOutputPath, getSdPath, getUpscannersPath } from '../config.js'
import { getSelectedImageState } from '../state/image-state.js'
import { startProcess, endProcess, isBusy } from '../busy.js'
import { getSelectedImage } from '../preview.js'
import { updateImageOpUI } from './image-input.js'

export function initUpscale() {
  const btnRun = document.getElementById('btn-run')

  document.getElementById('btn-upscale').addEventListener('click', () => {
    document.getElementById('popover-upscale').classList.toggle('open')
  })

  document.getElementById('btn-close-upscale').addEventListener('click', () => {
    document.getElementById('popover-upscale').classList.remove('open')
  })

  document.getElementById('btn-run-upscale-popover').addEventListener('click', async () => {
    if (isBusy()) return
    const selectedRadio = document.querySelector('input[name="upscale-model"]:checked')
    if (!selectedRadio) return
    const inputImage = getSelectedImage()
    if (!inputImage) return
    const sdPath = await getSdPath()
    const outputPath = await getOutputPath()
    const upscalersPath = await getUpscannersPath()
    if (!sdPath || !outputPath || !upscalersPath) return
    document.getElementById('popover-upscale').classList.remove('open')
    startProcess()
    btnRun.disabled = true
    try {
      await invoke('run_upscale', {
        sdPath: sdPath,
        outputPath: outputPath,
        upscalersPath: upscalersPath,
        model: selectedRadio.value,
        inputImage: inputImage,
      })
    } catch (e) {
      console.error('Upscale error:', e)
    } finally {
      endProcess()
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

  let isUpscaling = false
  function setUpscaling(running) {
    isUpscaling = running
    if (running) startProcess()
    else endProcess()
    const btnRunUpscale = document.getElementById('btn-run-upscale')
    const btnAbortUpscale = document.getElementById('btn-abort-upscale')
    if (running) {
      btnRun.disabled = true
      btnRunUpscale.disabled = true
      btnAbortUpscale.hidden = false
    } else {
      btnAbortUpscale.hidden = true
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
    if (isBusy()) return
    if (!img) return
    const sdPath = await getSdPath()
    const outputPath = await getOutputPath()
    const upscalersPath = await getUpscannersPath()
    if (!sdPath || !outputPath || !upscalersPath) return
    const selectedModel = document.querySelector('input[name="image-upscale-model"]:checked')
    if (!selectedModel) return
    setUpscaling(true)
    try {
      await invoke('run_upscale', {
        sdPath: sdPath,
        outputPath: outputPath,
        upscalersPath: upscalersPath,
        model: selectedModel.value,
        inputImage: img,
      })
    } catch (e) {
      console.error('Upscale error:', e)
    } finally {
      setUpscaling(false)
    }
  })
}

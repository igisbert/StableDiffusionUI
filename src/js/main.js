import { listen } from '@tauri-apps/api/event'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { createIcons, icons } from 'lucide'
import { initConfig, refreshAllSelects, getOutputPath, getSdPath, getUpscannersPath } from './config.js'
import { initInference } from './inference.js'
import { initPresets } from './presets.js'
import { initPromptTemplates } from './prompt-templates.js'
import { initTooltips } from './tooltips.js'
import { initNotifications, notify, toggle } from './notifications.js'
import { appendLine, clearConsole } from './console.js'
import { showPreview, getSelectedImage } from './preview.js'
import {
  loadEnhancerConfig,
  isEnhancerConfigured,
  setApiKey,
  setSelectedModel,
  fetchModels,
  enhancePrompt
} from './prompt-enhancer.js'

let capturedSeeds = []

async function updateEnhancerUI() {
  const configured = await isEnhancerConfigured()
  const btnEnhance = document.getElementById('btn-enhance')
  const btnGemini = document.getElementById('btn-gemini-settings')
  btnEnhance.style.display = configured ? 'flex' : 'none'
  btnGemini.style.display = 'flex'
}

document.addEventListener('DOMContentLoaded', async () => {
  createIcons({ icons })

  await initConfig()
  await initPresets()
  await initPromptTemplates()
  await initInference()
  initTooltips()
  await updateEnhancerUI()

  const btnNotif = document.getElementById('btn-notifications')
  let notifEnabled = true

  try {
    notifEnabled = await initNotifications()
  } catch (e) {
    console.error('Notifications init failed:', e)
  }

  function updateNotifBtnState(enabled) {
    btnNotif.innerHTML = enabled
      ? '<i data-lucide="bell"></i>'
      : '<i data-lucide="bell-off"></i>'
    btnNotif.classList.toggle('active', enabled)
    createIcons({ icons })
  }

  updateNotifBtnState(notifEnabled)

  btnNotif.addEventListener('click', async () => {
    try {
      notifEnabled = await toggle()
    } catch (e) {
      notifEnabled = !notifEnabled
    }
    updateNotifBtnState(notifEnabled)
  })

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    await refreshAllSelects()
    createIcons({ icons })
  })

  document.getElementById('btn-copy-seed').addEventListener('click', async () => {
    try {
      const text = capturedSeeds.length === 1
        ? capturedSeeds[0]
        : capturedSeeds.join(', ')
      if (!text) return
      await navigator.clipboard.writeText(text)
      const btn = document.getElementById('btn-copy-seed')
      btn.innerHTML = '<i data-lucide="check"></i> Copiar semilla'
      createIcons({ icons })
      setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy"></i> Copiar semilla'
        createIcons({ icons })
      }, 1500)
    } catch (e) {
      appendLine('[ERROR] No se pudo copiar al portapapeles: ' + e)
    }
  })

  document.getElementById('btn-copy-console').addEventListener('click', async () => {
    try {
      const consoleOutput = document.getElementById('console-output')?.textContent ?? ''
      if (!consoleOutput) return
      await navigator.clipboard.writeText(consoleOutput)
      const btn = document.getElementById('btn-copy-console')
      btn.innerHTML = '<i data-lucide="check"></i> Copiar salida de la consola'
      createIcons({ icons })
      setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy"></i> Copiar salida de la consola'
        createIcons({ icons })
      }, 1500)
    } catch (e) {
      appendLine('[ERROR] No se pudo copiar al portapapeles: ' + e)
    }
  })

  document.getElementById('btn-open-output').addEventListener('click', async () => {
    const output = await getOutputPath()
    if (output) await invoke('open_folder', { path: output })
  })

  // Gemini Dialog
  const dialogGemini = document.getElementById('dialog-gemini')
  const btnGemini = document.getElementById('btn-gemini-settings')
  const btnCloseGemini = document.getElementById('btn-close-gemini')
  const inputApiKey = document.getElementById('input-api-key')
  const btnSaveApiKey = document.getElementById('btn-save-api-key')
  const btnDeleteApiKey = document.getElementById('btn-delete-api-key')
  const selectGeminiModel = document.getElementById('select-gemini-model')
  const modelSelectRow = document.getElementById('model-select-row')

  btnGemini.addEventListener('click', async () => {
    const { apiKey, selectedModel } = await loadEnhancerConfig()
    inputApiKey.value = apiKey || ''
    btnDeleteApiKey.style.display = apiKey ? 'block' : 'none'
    if (apiKey) {
      const models = await fetchModels()
      selectGeminiModel.innerHTML = ''
      for (const [key, val] of Object.entries(models)) {
        const opt = document.createElement('option')
        opt.value = key
        opt.textContent = val.name
        selectGeminiModel.appendChild(opt)
      }
      if (selectedModel) selectGeminiModel.value = selectedModel
      modelSelectRow.style.display = 'flex'
      btnSaveApiKey.textContent = 'Guardar'
    } else {
      modelSelectRow.style.display = 'none'
      btnSaveApiKey.textContent = 'Continuar'
    }
    dialogGemini.showModal()
  })

  btnCloseGemini.addEventListener('click', () => dialogGemini.close())

  btnSaveApiKey.addEventListener('click', async () => {
    const key = inputApiKey.value.trim()
    if (!key) return

    const alreadyHasKey = !!(await loadEnhancerConfig()).apiKey

    if (!alreadyHasKey) {
      await setApiKey(key)
      const models = await fetchModels()
      selectGeminiModel.innerHTML = ''
      for (const [k, v] of Object.entries(models)) {
        const opt = document.createElement('option')
        opt.value = k
        opt.textContent = v.name
        selectGeminiModel.appendChild(opt)
      }
      modelSelectRow.style.display = 'flex'
      btnDeleteApiKey.style.display = 'block'
      btnSaveApiKey.textContent = 'Guardar'
    } else {
      await setSelectedModel(selectGeminiModel.value || null)
      dialogGemini.close()
    }
  })

  btnDeleteApiKey.addEventListener('click', async () => {
    await setApiKey(null)
    await setSelectedModel(null)
    inputApiKey.value = ''
    modelSelectRow.style.display = 'none'
    btnDeleteApiKey.style.display = 'none'
    await updateEnhancerUI()
    createIcons({ icons })
  })

  // Enhance button
  const btnEnhance = document.getElementById('btn-enhance')
  const inputPrompt = document.getElementById('input-prompt')

  btnEnhance.addEventListener('click', async () => {
    const prompt = inputPrompt.value.trim()
    if (!prompt) return

    btnEnhance.disabled = true
    btnEnhance.innerHTML = '<i data-lucide="loader"></i>'
    createIcons({ icons })

    try {
      const model = document.getElementById('select-model')?.value || ''
      const modelName = model.replace(/\.[^.]+$/, '')
      const enhanced = await enhancePrompt(prompt, modelName)
      inputPrompt.value = enhanced
    } catch (e) {
      appendLine('[ERROR] Error al mejorar prompt: ' + e)
    } finally {
      btnEnhance.disabled = false
      btnEnhance.innerHTML = '<i data-lucide="sparkles"></i>'
      createIcons({ icons })
    }
  })

  document.getElementById('btn-upscale').addEventListener('click', () => {
    document.getElementById('popover-upscale').classList.toggle('open')
  })

  document.getElementById('btn-close-upscale').addEventListener('click', () => {
    document.getElementById('popover-upscale').classList.remove('open')
  })

  document.getElementById('btn-run-upscale-popover').addEventListener('click', async () => {
    const selectedRadio = document.querySelector('input[name="upscale-model"]:checked')
    if (!selectedRadio) return

    const inputImage = getSelectedImage()
    if (!inputImage) return

    const sdPath = await getSdPath()
    const outputPath = await getOutputPath()
    const upscalersPath = await getUpscannersPath()

    if (!sdPath || !outputPath || !upscalersPath) return

    document.getElementById('popover-upscale').classList.remove('open')

    try {
      await invoke('run_upscale', {
        sdPath: sdPath,
        outputPath: outputPath,
        upscalersPath: upscalersPath,
        model: selectedRadio.value,
        inputImage: inputImage
      })
    } catch (e) {
      console.error('Upscale error:', e)
    }
  })

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('popover-upscale')
    const btn = document.getElementById('btn-upscale')
    if (!pop.contains(e.target) && !btn.contains(e.target)) {
      pop.classList.remove('open')
    }
  })

  // Image input section
  const btnToggleImageInput = document.getElementById('btn-toggle-image-input')
  const imageInputContent = document.getElementById('image-input-content')
  const btnSelectImage = document.getElementById('btn-select-image')
  const imageName = document.getElementById('image-input-name')
  const btnRunUpscale = document.getElementById('btn-run-upscale')
  let selectedImageForOp = null
  window.__selectedImageForOp = null

  function updateUpscaleButton() {
    const hasImage = !!selectedImageForOp
    const hasModel = !!document.querySelector('input[name="image-upscale-model"]:checked')
    btnRunUpscale.disabled = !(hasImage && hasModel)
  }

  const btnSizeFull = document.getElementById('btn-size-full')
  const btnSizeHalf = document.getElementById('btn-size-half')
  const btnSizeQuarter = document.getElementById('btn-size-quarter')
  const btnRun = document.getElementById('btn-run')

  function updateImageOpUI() {
    const hasImage = !!selectedImageForOp

    btnSizeFull.disabled = !hasImage
    btnSizeHalf.disabled = !hasImage
    btnSizeQuarter.disabled = !hasImage

    updateUpscaleButton()
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
    if (!selectedImageForOp) return
    const imageUrl = convertFileSrc(selectedImageForOp)
    getImageDimensions(imageUrl).then(({ width, height }) => {
      document.getElementById('input-width').value = Math.round(width * factor)
      document.getElementById('input-height').value = Math.round(height * factor)
    }).catch(e => console.error('Error leyendo dimensiones:', e))
  }

  btnSizeFull.addEventListener('click', () => applyImageSize(1))
  btnSizeHalf.addEventListener('click', () => applyImageSize(0.5))
  btnSizeQuarter.addEventListener('click', () => applyImageSize(0.25))

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

  populateImageUpscaleModels()

  const cancelOpLabel = document.getElementById('cancel-op-label')
  const upscaleOptions = document.getElementById('upscale-options')
  const img2imgOptions = document.getElementById('img2img-options')

  document.querySelectorAll('input[name="image-op"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const options = document.getElementById('image-op-options')
      const value = radio.value

      if (value === 'cancel') {
        radio.checked = false
        cancelOpLabel.style.display = 'none'
        options.classList.remove('visible')
        upscaleOptions.style.display = 'none'
        img2imgOptions.style.display = 'none'
        return
      }

      cancelOpLabel.style.display = 'inline-flex'
      options.classList.add('visible')

      upscaleOptions.style.display = value === 'upscale' ? 'flex' : 'none'
      img2imgOptions.style.display = value === 'img2img' ? 'flex' : 'none'

      updateImageOpUI()
    })
  })

  btnToggleImageInput.addEventListener('click', () => {
    btnToggleImageInput.classList.toggle('open')
    imageInputContent.classList.toggle('open')
  })

  btnSelectImage.addEventListener('click', async () => {
    const path = await invoke('pick_file')
    if (!path) return
    selectedImageForOp = path
    window.__selectedImageForOp = path
    const name = path.split(/[/\\]/).pop()
    imageName.textContent = name
    document.getElementById('btn-clear-image').classList.add('visible')
    updateImageOpUI()
  })

  document.getElementById('btn-clear-image').addEventListener('click', () => {
    selectedImageForOp = null
    window.__selectedImageForOp = null
    imageName.textContent = 'Ninguna'
    document.getElementById('btn-clear-image').classList.remove('visible')
    updateImageOpUI()
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
    window.__selectedImageForOp = filePath
    const name = filePath.split(/[/\\]/).pop()
    imageName.textContent = name
    document.getElementById('btn-clear-image').classList.add('visible')
    updateImageOpUI()
  })

  let isUpscaling = false

  function setUpscaling(running) {
    isUpscaling = running
    const btnRunUpscale = document.getElementById('btn-run-upscale')
    const btnAbortUpscale = document.getElementById('btn-abort-upscale')
    if (running) {
      btnRun.disabled = true
      btnRunUpscale.disabled = true
      btnAbortUpscale.hidden = false
    } else {
      btnAbortUpscale.hidden = true
      updateImageOpUI()
    }
  }

  document.getElementById('btn-abort-upscale').addEventListener('click', async () => {
    try { await invoke('abort_inference') } catch (e) {}
  })

  btnRunUpscale.addEventListener('click', async () => {
    if (!selectedImageForOp) return
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
        inputImage: selectedImageForOp
      })
    } catch (e) {
      console.error('Upscale error:', e)
    } finally {
      setUpscaling(false)
    }
  })

  await listen('console-line', (event) => {
    const line = event.payload
    const match = line.match(/generating image: \d+\/\d+ - seed (\d+)/)
    if (match) capturedSeeds.push(match[1])
    appendLine(line)
  })

  await listen('inference-started', () => {
    capturedSeeds = []
    document.getElementById('btn-upscale').disabled = true
  })

  await listen('inference-done', async (event) => {
    showPreview(event.payload)
    document.getElementById('btn-upscale').disabled = false
    updateImageOpUI()
    notify('Generación completada', 'Tu imagen está lista.')
  })

  await listen('upscale-done', (event) => {
    showPreview(event.payload)
    document.getElementById('btn-upscale').disabled = false
    document.getElementById('btn-copy-seed').disabled = false
    document.getElementById('btn-copy-console').disabled = false
    notify('Upscale completado', 'Tu imagen escalada está lista.')
  })
})

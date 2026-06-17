import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { createIcons, icons } from 'lucide'
import { initConfig, refreshAllSelects, getOutputPath } from './config.js'
import { initInference } from './inference.js'
import { initPresets } from './presets.js'
import { initTooltips } from './tooltips.js'
import { appendLine, clearConsole } from './console.js'
import { showPreview } from './preview.js'
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
  initInference()
  initTooltips()
  await updateEnhancerUI()

  document.getElementById('btn-refresh').addEventListener('click', async () => {
    await refreshAllSelects()
    createIcons({ icons })
  })

  document.getElementById('btn-copy-seed').addEventListener('click', async () => {
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
  })

  document.getElementById('btn-copy-console').addEventListener('click', async () => {
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
      await updateEnhancerUI()
      createIcons({ icons })
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

  await listen('console-line', (event) => {
    const line = event.payload
    const match = line.match(/generating image: \d+\/\d+ - seed (\d+)/)
    if (match) capturedSeeds.push(match[1])
    appendLine(line)
  })

  await listen('inference-started', () => {
    capturedSeeds = []
  })

  await listen('inference-done', (event) => {
    showPreview(event.payload)
  })
})

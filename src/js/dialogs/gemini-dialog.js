import { createIcons, icons } from 'lucide'
import { appendLine } from '../console.js'
import {
  loadEnhancerConfig,
  isEnhancerConfigured,
  setApiKey,
  setSelectedModel,
  fetchModels,
  enhancePrompt,
} from '../prompt-enhancer.js'

export async function initGeminiDialog() {
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
      const imageOp = document.querySelector('input[name="image-op"]:checked')?.value
      let task
      if (imageOp === 'img2img') task = 'i2i'
      else if (imageOp === 'inpainting') task = 'inpaint'
      else if (imageOp === 'image-edit') task = 'edit'
      else task = 't2i'
      const enhanced = await enhancePrompt(prompt, { modelFileName: model, task })
      inputPrompt.value = enhanced
    } catch (e) {
      appendLine('[ERROR] Error al mejorar prompt: ' + e)
    } finally {
      btnEnhance.disabled = false
      btnEnhance.innerHTML = '<i data-lucide="sparkles"></i>'
      createIcons({ icons })
    }
  })
}

async function updateEnhancerUI() {
  const btnEnhance = document.getElementById('btn-enhance')
  const btnGemini = document.getElementById('btn-gemini-settings')
  const configured = await isEnhancerConfigured()
  btnEnhance.style.display = configured ? 'flex' : 'none'
  btnGemini.style.display = 'flex'
}

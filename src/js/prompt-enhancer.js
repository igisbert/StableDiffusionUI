import { Store } from '@tauri-apps/plugin-store'

const MODELS_URL = 'https://raw.githubusercontent.com/user/repo/main/models.json'

const ENHANCE_SYSTEM_PROMPT = `You are an expert at writing prompts for Stable Diffusion, 
Flux and similar image generation models. Enhance the user's prompt adding visual style, 
lighting, quality descriptors and artistic references relevant to the active model. 
Return ONLY the enhanced prompt, no explanation, no quotes.`

let store = null
let models = null

async function getStore() {
  if (!store) store = await Store.load('enhancer.json')
  return store
}

export async function loadEnhancerConfig() {
  const s = await getStore()
  const apiKey = await s.get('api_key')
  const selectedModel = await s.get('selected_model')
  return { apiKey: apiKey || null, selectedModel: selectedModel || null }
}

export async function isEnhancerConfigured() {
  const { apiKey } = await loadEnhancerConfig()
  return !!apiKey
}

export async function setApiKey(key) {
  const s = await getStore()
  if (key) {
    await s.set('api_key', key)
  } else {
    await s.delete('api_key')
  }
  await s.save()
}

export async function setSelectedModel(modelKey) {
  const s = await getStore()
  await s.set('selected_model', modelKey)
  await s.save()
}

export async function fetchModels() {
  if (models) return models
  try {
    const res = await fetch(MODELS_URL)
    if (!res.ok) throw new Error(res.statusText)
    models = await res.json()
  } catch {
    models = {
      gemma: { id: 'gemma-4-31b-it', name: 'Gemma 4' },
      flash: { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1' }
    }
  }
  return models
}

export async function enhancePrompt(promptText, modelContext) {
  const { apiKey, selectedModel } = await loadEnhancerConfig()
  if (!apiKey) throw new Error('API key no configurada')
  if (!selectedModel) throw new Error('Modelo no seleccionado')

  const allModels = await fetchModels()
  const model = allModels[selectedModel]
  if (!model) throw new Error('Modelo no encontrado')

  const systemPrompt = modelContext
    ? `${ENHANCE_SYSTEM_PROMPT}\n\nThe active model is: ${modelContext}`
    : ENHANCE_SYSTEM_PROMPT

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] }
      })
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new Error(err?.error?.message || `Error ${res.status}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || promptText
}

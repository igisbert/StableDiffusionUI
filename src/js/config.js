import { Store } from '@tauri-apps/plugin-store'
import { invoke } from '@tauri-apps/api/core'
import { applyArch } from './arch.js'

let store

const PATH_KEYS = [
  { key: 'sd_path',     action: 'pick-sdcpp', display: 'path-sdcpp-text' },
  { key: 'output_path', action: 'pick-output', display: 'path-output-text' },
  { key: 'models_path', action: 'pick-models', display: 'path-models-text' },
  { key: 'vae_path',    action: 'pick-vae',    display: 'path-vae-text' },
  { key: 'llm_path',    action: 'pick-llm',    display: 'path-llm-text' },
  { key: 'lora_path',   action: 'pick-lora',   display: 'path-lora-text' },
]

export async function initConfig() {
  store = await Store.load('config.json')

  for (const { key, display } of PATH_KEYS) {
    const path = await store.get(key)
    if (path) updatePathDisplay(display, path)
  }

  const modelsPath = await store.get('models_path')
  if (modelsPath) await scanModels(modelsPath)

  const vaePath = await store.get('vae_path')
  if (vaePath) await scanVae(vaePath)

  const llmPath = await store.get('llm_path')
  if (llmPath) await scanEncoders(llmPath)

  const loraPath = await store.get('lora_path')
  if (loraPath) await scanLoras(loraPath)

  for (const { key, action, display } of PATH_KEYS) {
    document.querySelector(`[data-action="${action}"]`)?.addEventListener('click', async () => {
      const path = await invoke('pick_folder')
      if (!path) return
      if (key === 'output_path' || key === 'models_path' || key === 'vae_path' || key === 'llm_path' || key === 'lora_path') {
        await invoke('ensure_output_dir', { path })
      }
      await store.set(key, path)
      await store.save()
      updatePathDisplay(display, path)
      if (key === 'models_path') await scanModels(path)
      if (key === 'vae_path') await scanVae(path)
      if (key === 'llm_path') await scanEncoders(path)
      if (key === 'lora_path') await scanLoras(path)
    })
  }
}

async function scanModels(modelsPath) {
  const result = await invoke('scan_models', { basePath: modelsPath })
  populateSelect('select-model', result.models)

  document.getElementById('select-model').addEventListener('change', async (e) => {
    if (!e.target.value) return
    const arch = await invoke('detect_model_arch', {
      basePath: modelsPath,
      filename: e.target.value
    })
    applyArch(arch)
  })

  const currentModel = document.getElementById('select-model').value
  if (currentModel) {
    const arch = await invoke('detect_model_arch', { basePath: modelsPath, filename: currentModel })
    applyArch(arch)
  }
}

async function scanVae(vaePath) {
  const result = await invoke('scan_models', { basePath: vaePath })
  populateSelect('select-vae', result.models, true)
}

async function scanEncoders(llmPath) {
  const result = await invoke('scan_models', { basePath: llmPath })
  populateSelect('select-llm', result.models, true)
}

async function scanLoras(loraPath) {
  const result = await invoke('scan_models', { basePath: loraPath })
  populateSelect('select-lora', result.models, true)
}

function populateSelect(id, items, withNone = false) {
  const sel = document.getElementById(id)
  if (!sel) return
  sel.innerHTML = ''
  if (withNone) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = 'None'
    sel.appendChild(opt)
  }
  for (const item of items) {
    const opt = document.createElement('option')
    opt.value = item
    opt.textContent = item
    sel.appendChild(opt)
  }
}

export async function getSdPath() { return store.get('sd_path') }
export async function getOutputPath() { return store.get('output_path') }
export async function getModelsPath() { return store.get('models_path') }
export async function getVaePath() { return store.get('vae_path') }
export async function getLlmPath() { return store.get('llm_path') }
export async function getLoraPath() { return store.get('lora_path') }

function updatePathDisplay(id, path) {
  const el = document.getElementById(id)
  if (el) el.textContent = path
}

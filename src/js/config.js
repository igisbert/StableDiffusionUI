import { Store } from '@tauri-apps/plugin-store'
import { invoke } from '@tauri-apps/api/core'
import { scanModels } from './model-scan.js'

const store = new Store('config.json')

const PATH_KEYS = [
  { key: 'sd_path',     action: 'pick-sdcpp', display: 'path-sdcpp-text' },
  { key: 'output_path', action: 'pick-output', display: 'path-output-text' },
  { key: 'models_path', action: 'pick-models', display: 'path-models-text' },
  { key: 'vae_path',    action: 'pick-vae',    display: 'path-vae-text' },
  { key: 'llm_path',    action: 'pick-llm',    display: 'path-llm-text' },
  { key: 'lora_path',   action: 'pick-lora',   display: 'path-lora-text' },
]

export async function initConfig() {
  for (const { key, action, display } of PATH_KEYS) {
    const path = await store.get(key)
    if (path) updatePathDisplay(display, path)
  }

  const modelsPath = await store.get('models_path')
  if (modelsPath) await scanModels(modelsPath)

  for (const { key, action, display } of PATH_KEYS) {
    document.querySelector(`[data-action="${action}"]`)?.addEventListener('click', async () => {
      const path = await invoke('pick_folder')
      if (!path) return
      if (key === 'output_path' || key === 'models_path') {
        await invoke('ensure_output_dir', { path })
      }
      await store.set(key, path)
      await store.save()
      updatePathDisplay(display, path)
      if (key === 'models_path') await scanModels(path)
    })
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
